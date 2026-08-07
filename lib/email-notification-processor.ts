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
    automationEnabled: boolean;
    testMode: boolean;
    welcomeProcessingEnabled: boolean;
    remindersQueued: number;
    followUpsQueued: number;
    claimed: number;
    sent: number;
    cancelled: number;
    deferred: number;
};

type EmailProcessorConfig = {
    reminderLeadMinutes: number;
    followupDelayMinutes: number;
    maxLatenessMinutes: number;
    batchSize: number;
    maxJobsPerRun: number;
    lockTimeoutMinutes: number;
    automationEnabled: boolean;
    testMode: boolean;
    testRecipients: string[];
    processWelcomeJobs: boolean;
};

type DeliveryOutcome =
    | { status: "sent"; emailId: string }
    | { status: "cancelled"; reason: string };

type PreparedDelivery =
    | { toEmail: string; ccEmails: string[]; isTest: boolean; cancelReason?: never }
    | { cancelReason: string; toEmail?: never; ccEmails?: never; isTest?: never };

const EMAIL_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

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

function parseBooleanFlag(value: string | undefined, fallback = false) {
    if (!value) return fallback;

    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;

    throw new Error("Email automation boolean flags must be either true or false.");
}

function parseEmailList(value: string | undefined) {
    const recipients = (value || "")
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean);

    for (const email of recipients) {
        if (!EMAIL_PATTERN.test(email)) {
            throw new Error("EMAIL_TEST_RECIPIENTS contains an invalid email address.");
        }
    }

    return [...new Set(recipients)];
}

function getProcessorConfig(): EmailProcessorConfig {
    const testMode = parseBooleanFlag(process.env.EMAIL_TEST_MODE, false);
    const testRecipients = parseEmailList(process.env.EMAIL_TEST_RECIPIENTS);

    if (testMode && testRecipients.length === 0) {
        throw new Error("EMAIL_TEST_RECIPIENTS must be configured when EMAIL_TEST_MODE=true.");
    }

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
        automationEnabled: parseBooleanFlag(process.env.EMAIL_AUTOMATION_ENABLED, false),
        testMode,
        testRecipients,
        processWelcomeJobs: parseBooleanFlag(process.env.EMAIL_PROCESS_WELCOME_JOBS, false),
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

function isAutomaticNotification(notificationType: NotificationType) {
    return notificationType === "event_reminder" || notificationType === "attendance_follow_up";
}

function getClaimableNotificationTypes(config: EmailProcessorConfig): NotificationType[] | null {
    if (config.automationEnabled && config.processWelcomeJobs) return null;
    if (config.automationEnabled) return ["event_reminder", "attendance_follow_up"];
    if (config.processWelcomeJobs) return ["welcome"];
    return [];
}

function prepareAutomaticTestDelivery(
    job: EmailNotificationJob,
    config: EmailProcessorConfig,
): PreparedDelivery {
    if (!config.testMode || !isAutomaticNotification(job.notification_type)) {
        return {
            toEmail: job.recipient_email,
            ccEmails: job.cc_emails || [],
            isTest: false,
        };
    }

    const recipientEmail = job.recipient_email.trim().toLowerCase();
    if (!config.testRecipients.includes(recipientEmail)) {
        return {
            cancelReason: "Automatic email test mode skipped a non-allowlisted recipient",
        };
    }

    return {
        toEmail: recipientEmail,
        ccEmails: [],
        isTest: true,
    };
}

async function sendNotificationJob(
    job: EmailNotificationJob,
    config: EmailProcessorConfig,
): Promise<DeliveryOutcome> {
    const delivery = prepareAutomaticTestDelivery(job, config);
    if (typeof delivery.cancelReason === "string") {
        return { status: "cancelled", reason: delivery.cancelReason };
    }

    let result;

    switch (job.notification_type) {
        case "welcome":
            result = await sendWelcomeEmail({
                toEmail: job.recipient_email,
                firstName: job.recipient_first_name,
                lastName: job.recipient_last_name || "",
                workerId: requireValue(job.worker_id, "worker_id"),
                department: job.department_name || "Assigned department",
                team: job.team_name,
                notificationId: job.id,
            });
            break;
        case "event_reminder":
            result = await sendEventReminderEmail({
                toEmail: delivery.toEmail,
                firstName: job.recipient_first_name,
                eventTitle: requireValue(job.event_title, "event_title"),
                eventStart: parseJobDate(job.event_start_at, "event_start_at"),
                timezone: requireValue(job.event_timezone, "event_timezone"),
                locationName: job.location_name,
                reminderLeadMinutes: job.reminder_lead_minutes || config.reminderLeadMinutes,
                notificationId: job.id,
                isTest: delivery.isTest,
            });
            break;
        case "attendance_follow_up":
            result = await sendMissedAttendanceEmail({
                toEmail: delivery.toEmail,
                ccEmails: delivery.ccEmails,
                firstName: job.recipient_first_name,
                eventTitle: requireValue(job.event_title, "event_title"),
                eventStart: parseJobDate(job.event_start_at, "event_start_at"),
                eventEnd: parseJobDate(job.event_end_at, "event_end_at"),
                timezone: requireValue(job.event_timezone, "event_timezone"),
                departmentName: job.department_name,
                notificationId: job.id,
            });
            break;
        default: {
            const exhaustiveCheck: never = job.notification_type;
            throw new Error(`Unsupported email notification type: ${exhaustiveCheck}`);
        }
    }

    if (!result.success) {
        throw new Error(result.error);
    }

    return { status: "sent", emailId: result.emailId };
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

    let remindersQueued = 0;
    let followUpsQueued = 0;

    if (config.automationEnabled) {
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
        remindersQueued = Number(enqueueSummary?.reminder_jobs_created || 0);
        followUpsQueued = Number(enqueueSummary?.followup_jobs_created || 0);
    }

    let claimed = 0;
    let sent = 0;
    let cancelled = 0;
    let deferred = 0;
    const claimableNotificationTypes = getClaimableNotificationTypes(config);

    if (claimableNotificationTypes?.length === 0) {
        return {
            processorId,
            automationEnabled: config.automationEnabled,
            testMode: config.testMode,
            welcomeProcessingEnabled: config.processWelcomeJobs,
            remindersQueued,
            followUpsQueued,
            claimed,
            sent,
            cancelled,
            deferred,
        };
    }

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
                p_notification_types: claimableNotificationTypes,
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
                const result = await sendNotificationJob(job, config);

                if (result.status === "cancelled") {
                    const { error: cancelError } = await supabase.rpc(
                        "cancel_email_notification_job",
                        {
                            p_job_id: job.id,
                            p_worker_id: processorId,
                            p_error: result.reason,
                        },
                    );

                    if (cancelError) {
                        throw new Error(`Email job could not be cancelled: ${cancelError.message}`);
                    }

                    cancelled += 1;
                    return;
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
        automationEnabled: config.automationEnabled,
        testMode: config.testMode,
        welcomeProcessingEnabled: config.processWelcomeJobs,
        remindersQueued,
        followUpsQueued,
        claimed,
        sent,
        cancelled,
        deferred,
    };
}
