import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/utils/supabase/admin";
import {
    assertAutomaticEmailDeliveryIsProductionSafe,
    sendEventReminderEmail,
    sendMissedAttendanceEmail,
    sendWelcomeEmail,
} from "@/lib/email";

type NotificationType = "welcome" | "event_reminder" | "attendance_follow_up";

type EmailNotificationJob = {
    id: string;
    notification_type: NotificationType;
    recipient_email: string;
    recipient_first_name: string;
    recipient_last_name: string | null;
    cc_emails: string[] | null;
    worker_id: string | null;
    event_title: string | null;
    event_start_at: string | null;
    event_end_at: string | null;
    event_timezone: string | null;
    location_name: string | null;
    department_name: string | null;
    team_name: string | null;
    reminder_lead_minutes: number | null;
};

export type EmailProcessorSummary = {
    processorId: string;
    remindersQueued: number;
    followUpsQueued: number;
    claimed: number;
    sent: number;
    deferred: number;
};

function parseBoundedInteger(
    value: string | undefined,
    fallback: number,
    minimum: number,
    maximum: number,
) {
    if (!value) return fallback;

    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
        throw new Error(`Email processor configuration must be between ${minimum} and ${maximum}.`);
    }

    return parsed;
}

function getProcessorConfig() {
    return {
        reminderLeadMinutes: parseBoundedInteger(
            process.env.EMAIL_REMINDER_LEAD_MINUTES,
            30,
            1,
            1440,
        ),
        followupDelayMinutes: parseBoundedInteger(
            process.env.EMAIL_FOLLOWUP_DELAY_MINUTES,
            60,
            1,
            1440,
        ),
        maxLatenessMinutes: parseBoundedInteger(
            process.env.EMAIL_NOTIFICATION_MAX_LATENESS_MINUTES,
            1440,
            1,
            1440,
        ),
        batchSize: parseBoundedInteger(
            process.env.EMAIL_NOTIFICATION_BATCH_SIZE,
            20,
            1,
            50,
        ),
        maxJobsPerRun: parseBoundedInteger(
            process.env.EMAIL_NOTIFICATION_MAX_JOBS_PER_RUN,
            100,
            1,
            500,
        ),
        lockTimeoutMinutes: parseBoundedInteger(
            process.env.EMAIL_NOTIFICATION_LOCK_TIMEOUT_MINUTES,
            10,
            1,
            60,
        ),
    };
}

function getFailureMessage(error: unknown) {
    return error instanceof Error ? error.message : "Unknown email processor failure";
}

function requireValue<T>(value: T | null, field: string): T {
    if (value === null) {
        throw new Error(`Email job is missing required field: ${field}.`);
    }

    return value;
}

function parseJobDate(value: string | null, field: string) {
    const date = new Date(requireValue(value, field));
    if (Number.isNaN(date.getTime())) {
        throw new Error(`Email job contains an invalid ${field}.`);
    }

    return date;
}

async function sendNotificationJob(
    job: EmailNotificationJob,
    fallbackReminderLeadMinutes: number,
) {
    switch (job.notification_type) {
        case "welcome":
            return sendWelcomeEmail({
                toEmail: job.recipient_email,
                firstName: job.recipient_first_name,
                lastName: job.recipient_last_name || "",
                workerId: requireValue(job.worker_id, "worker_id"),
                department: job.department_name || "Assigned department",
                team: job.team_name,
                notificationId: job.id,
            });
        case "event_reminder":
            return sendEventReminderEmail({
                toEmail: job.recipient_email,
                firstName: job.recipient_first_name,
                eventTitle: requireValue(job.event_title, "event_title"),
                eventStart: parseJobDate(job.event_start_at, "event_start_at"),
                timezone: requireValue(job.event_timezone, "event_timezone"),
                locationName: job.location_name,
                reminderLeadMinutes: job.reminder_lead_minutes || fallbackReminderLeadMinutes,
                notificationId: job.id,
            });
        case "attendance_follow_up":
            return sendMissedAttendanceEmail({
                toEmail: job.recipient_email,
                ccEmails: job.cc_emails || [],
                firstName: job.recipient_first_name,
                eventTitle: requireValue(job.event_title, "event_title"),
                eventStart: parseJobDate(job.event_start_at, "event_start_at"),
                eventEnd: parseJobDate(job.event_end_at, "event_end_at"),
                timezone: requireValue(job.event_timezone, "event_timezone"),
                departmentName: job.department_name,
                notificationId: job.id,
            });
        default: {
            const exhaustiveCheck: never = job.notification_type;
            throw new Error(`Unsupported email notification type: ${exhaustiveCheck}`);
        }
    }
}

export async function processDueEmailNotifications(): Promise<EmailProcessorSummary> {
    const runStartedAt = Date.now();
    // Leave enough headroom inside the 60-second route limit for the final SMTP
    // timeout, outbox acknowledgement, and platform response serialization.
    const processingBudgetMs = 20_000;
    const config = getProcessorConfig();
    assertAutomaticEmailDeliveryIsProductionSafe();
    const processorId = randomUUID();
    const supabase = createAdminClient();

    const { data: enqueueData, error: enqueueError } = await supabase.rpc(
        "enqueue_due_email_notifications",
        {
            p_reference_time: new Date().toISOString(),
            p_reminder_lead_minutes: config.reminderLeadMinutes,
            p_followup_delay_minutes: config.followupDelayMinutes,
            p_max_lateness_minutes: config.maxLatenessMinutes,
        },
    );

    if (enqueueError) {
        throw new Error(`Unable to enqueue email notifications: ${enqueueError.message}`);
    }

    const enqueueSummary = Array.isArray(enqueueData) ? enqueueData[0] : enqueueData;
    const remindersQueued = Number(enqueueSummary?.reminder_jobs_created || 0);
    const followUpsQueued = Number(enqueueSummary?.followup_jobs_created || 0);

    let claimed = 0;
    let sent = 0;
    let deferred = 0;

    while (
        claimed < config.maxJobsPerRun
        && Date.now() - runStartedAt < processingBudgetMs
    ) {
        const currentBatchSize = Math.min(
            config.batchSize,
            config.maxJobsPerRun - claimed,
        );
        const { data: claimedData, error: claimError } = await supabase.rpc(
            "claim_email_notification_jobs",
            {
                p_worker_id: processorId,
                p_batch_size: currentBatchSize,
                p_lock_timeout_minutes: config.lockTimeoutMinutes,
            },
        );

        if (claimError) {
            throw new Error(`Unable to claim email notifications: ${claimError.message}`);
        }

        const jobs = (claimedData || []) as EmailNotificationJob[];
        if (jobs.length === 0) break;

        claimed += jobs.length;

        await Promise.all(jobs.map(async (job) => {
            try {
                const result = await sendNotificationJob(job, config.reminderLeadMinutes);

                if (!result.success) {
                    throw new Error(result.error);
                }

                const { error: markSentError } = await supabase.rpc(
                    "mark_email_notification_sent",
                    {
                        p_job_id: job.id,
                        p_worker_id: processorId,
                        p_provider_message_id: result.emailId,
                    },
                );

                if (markSentError) {
                    throw new Error(`SMTP accepted the message but the outbox could not be finalized: ${markSentError.message}`);
                }

                sent += 1;
            } catch (error: unknown) {
                const failureMessage = getFailureMessage(error);
                const { error: markFailedError } = await supabase.rpc(
                    "mark_email_notification_failed",
                    {
                        p_job_id: job.id,
                        p_worker_id: processorId,
                        p_error: failureMessage,
                    },
                );

                if (markFailedError) {
                    console.error("[EmailProcessor] Could not release failed job.", {
                        jobId: job.id,
                        message: markFailedError.message,
                    });
                }

                console.error("[EmailProcessor] Delivery attempt deferred.", {
                    jobId: job.id,
                    message: failureMessage,
                });
                deferred += 1;
            }
        }));

        if (jobs.length < currentBatchSize) break;
    }

    return {
        processorId,
        remindersQueued,
        followUpsQueued,
        claimed,
        sent,
        deferred,
    };
}
