"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const validRecurrenceDays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const validScheduleFrequencies = ["once", "daily", "weekly", "monthly", "yearly"] as const;
const recurrenceDayCodes: Record<(typeof validRecurrenceDays)[number], string> = {
    Sunday: "SU",
    Monday: "MO",
    Tuesday: "TU",
    Wednesday: "WE",
    Thursday: "TH",
    Friday: "FR",
    Saturday: "SA",
};

const eventIdSchema = z.string().uuid();
const eventFormSchema = z.object({
    title: z.string().trim().min(3, "Event title must be at least 3 characters.").max(120, "Event title must be 120 characters or fewer."),
    description: z.string().trim().max(1000, "Description must be 1000 characters or fewer.").optional(),
    schedule_frequency: z.enum(validScheduleFrequencies),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Please choose a valid event date."),
    start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Please choose a valid start time."),
    end_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Please choose a valid end time."),
    timezone: z.string().trim().min(1, "Please choose a timezone.").max(80, "Timezone must be 80 characters or fewer."),
    recurrence_day: z.enum(validRecurrenceDays).optional(),
    recurrence_month: z.coerce.number().int().min(1).max(12).optional(),
    recurrence_month_day: z.coerce.number().int().min(1).max(31).optional(),
    location_ids: z.array(z.string().uuid()).min(1, "At least one location is required."),
    department_id: z.string().uuid("Please select a valid department.").optional().nullable(),
    email_notifications_enabled: z.preprocess(
        (value) => value === "on" || value === "true",
        z.boolean(),
    ),
    email_target_worker_ids: z.array(z.string().uuid()).nullable().optional(),
});
type EventPayload = {
    title: string;
    description: string | null;
    schedule_frequency: (typeof validScheduleFrequencies)[number];
    start_date: string;
    start_time: string;
    end_time: string;
    timezone: string;
    recurrence_day: string | null;
    recurrence_month: number | null;
    recurrence_month_day: number | null;
    recurrence_rule: string | null;
    location_ids: string[];
    department_id: string | null;
    email_notifications_enabled: boolean;
    email_target_worker_ids: string[] | null;
};
type EventFormResult = { data: EventPayload; error?: never } | { error: string; data?: never };

function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : "An unexpected error occurred.";
}

function getMutationErrorMessage(action: "create" | "update" | "delete", error: { code?: string; message?: string }) {
    const message = error.message?.toLowerCase() || "";

    if (
        error.code === "42703" ||
        error.code === "PGRST204" ||
        message.includes("column") ||
        message.includes("schema cache")
    ) {
        return "Event scheduling columns are missing in Supabase. Run supabase_event_schedule_migration.sql, then refresh this page.";
    }

    if (message.includes("row-level security") || error.code === "42501") {
        return "Your admin account is not allowed to manage events. Please check the events RLS policies.";
    }

    return `Failed to ${action} event. Please try again.`;
}

function isValidMonthDay(month: number, day: number) {
    const daysInMonth = new Date(2024, month, 0).getDate();
    return day <= daysInMonth;
}

function buildRecurrenceRule(
    scheduleFrequency: (typeof validScheduleFrequencies)[number],
    recurrenceDay: (typeof validRecurrenceDays)[number] | null,
    recurrenceMonth: number | null,
    recurrenceMonthDay: number | null,
) {
    if (scheduleFrequency === "once") return null;

    if (scheduleFrequency === "daily") return "FREQ=DAILY;INTERVAL=1";
    if (scheduleFrequency === "weekly" && recurrenceDay) return `FREQ=WEEKLY;INTERVAL=1;BYDAY=${recurrenceDayCodes[recurrenceDay]}`;

    if (scheduleFrequency === "monthly" && recurrenceMonthDay) {
        return `FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=${recurrenceMonthDay}`;
    }

    if (scheduleFrequency === "yearly" && recurrenceMonth && recurrenceMonthDay) {
        return `FREQ=YEARLY;INTERVAL=1;BYMONTH=${recurrenceMonth};BYMONTHDAY=${recurrenceMonthDay}`;
    }

    return null;
}

function parseEventFormData(formData: FormData): EventFormResult {
    let parsedLocations: unknown = [];
    const rawLocations = formData.get("location_ids");
    if (rawLocations && typeof rawLocations === "string") {
        try {
            parsedLocations = JSON.parse(rawLocations);
        } catch {
            return { error: "Invalid location data payload provided." };
        }
    }

    let parsedTargetWorkers: unknown = null;
    const rawTargetWorkers = formData.get("email_target_worker_ids");
    if (rawTargetWorkers && typeof rawTargetWorkers === "string") {
        try {
            const parsed = JSON.parse(rawTargetWorkers);
            if (Array.isArray(parsed) && parsed.length > 0) {
                parsedTargetWorkers = parsed;
            }
        } catch {
            return { error: "Invalid target workers data payload provided." };
        }
    }

    const rawDeptId = formData.get("department_id")?.toString() || null;

    const validatedFields = eventFormSchema.safeParse({
        title: formData.get("title"),
        description: formData.get("description")?.toString() || undefined,
        schedule_frequency: formData.get("schedule_frequency"),
        start_date: formData.get("start_date"),
        start_time: formData.get("start_time"),
        end_time: formData.get("end_time"),
        timezone: formData.get("timezone")?.toString() || "Africa/Lagos",
        recurrence_day: formData.get("recurrence_day")?.toString() || undefined,
        recurrence_month: formData.get("recurrence_month")?.toString() || undefined,
        recurrence_month_day: formData.get("recurrence_month_day")?.toString() || undefined,
        location_ids: parsedLocations,
        department_id: rawDeptId || undefined,
        email_notifications_enabled: formData.get("email_notifications_enabled"),
        email_target_worker_ids: parsedTargetWorkers,
    });

    if (!validatedFields.success) {
        return {
            error: validatedFields.error.issues[0]?.message || "Please check the event details and try again.",
        };
    }

    const {
        title,
        description,
        schedule_frequency: scheduleFrequency,
        start_date: startDate,
        start_time: startTime,
        end_time: endTime,
        timezone,
        recurrence_day: recurrenceDay,
        recurrence_month: recurrenceMonth,
        recurrence_month_day: recurrenceMonthDay,
        location_ids,
        department_id,
        email_notifications_enabled,
        email_target_worker_ids,
    } = validatedFields.data;

    if (endTime <= startTime) {
        return { error: "End time must be later than start time." };
    }

    if (scheduleFrequency === "weekly" && !recurrenceDay) {
        return { error: "Please choose the weekday this event repeats on." };
    }

    if (scheduleFrequency === "monthly" && !recurrenceMonthDay) {
        return { error: "Please choose the day of the month this event repeats on." };
    }

    if (scheduleFrequency === "yearly") {
        if (!recurrenceMonth || !recurrenceMonthDay) {
            return { error: "Please choose the month and day this yearly event repeats on." };
        }

        if (!isValidMonthDay(recurrenceMonth, recurrenceMonthDay)) {
            return { error: "Please choose a valid month and day for this yearly event." };
        }
    }

    return {
        data: {
            title,
            description: description || null,
            schedule_frequency: scheduleFrequency,
            start_date: startDate,
            start_time: startTime,
            end_time: endTime,
            timezone,
            recurrence_day: scheduleFrequency === "weekly" ? recurrenceDay || null : null,
            recurrence_month: scheduleFrequency === "yearly" ? recurrenceMonth || null : null,
            recurrence_month_day: scheduleFrequency === "monthly" || scheduleFrequency === "yearly" ? recurrenceMonthDay || null : null,
            recurrence_rule: buildRecurrenceRule(
                scheduleFrequency,
                recurrenceDay || null,
                recurrenceMonth || null,
                recurrenceMonthDay || null,
            ),
            location_ids,
            department_id: department_id || null,
            email_notifications_enabled,
            email_target_worker_ids: email_target_worker_ids || null,
        },
    };
}

import { requireAdminAuth } from "@/lib/rbac";

export async function createEvent(formData: FormData) {
    try {
        const scope = await requireAdminAuth();
        const supabase = await createClient();

        const parsed = parseEventFormData(formData);
        if ("error" in parsed) return { error: parsed.error };

        // Department Heads must assign their managed department
        if (!scope.isSuperAdmin) {
            if (!parsed.data.department_id || !scope.managedDepartmentIds.includes(parsed.data.department_id)) {
                return { error: "You can only create events for your managed department." };
            }
        }

        const { error } = await supabase
            .from('events')
            .insert([{ ...parsed.data, created_by: scope.user.id }]);

        if (error) {
            console.error("Create Event Error:", error);
            return { error: getMutationErrorMessage("create", error) };
        }

        revalidatePath("/admin/events");
        revalidatePath("/admin");
        return { success: true };
    } catch (e: unknown) {
        return { error: getErrorMessage(e) };
    }
}

export async function updateEvent(id: string, formData: FormData) {
    try {
        const scope = await requireAdminAuth();
        const supabase = await createClient();

        const eventId = eventIdSchema.safeParse(id);
        if (!eventId.success) return { error: "Invalid event selected." };

        // Production Lock: Prevent editing events while a live session is active
        const { data: activeSession } = await supabase
            .from('attendance_sessions')
            .select('id')
            .eq('event_id', eventId.data)
            .eq('status', 'active')
            .maybeSingle();

        if (activeSession) {
            return { error: "Cannot edit this event while a live session is active. Extend time from the Live Session controller instead." };
        }

        const parsed = parseEventFormData(formData);
        if ("error" in parsed) return { error: parsed.error };

        // Department Head boundary: can only update events in their scope
        if (!scope.isSuperAdmin) {
            const { data: existing } = await supabase
                .from('events')
                .select('department_id, created_by')
                .eq('id', eventId.data)
                .maybeSingle();

            if (!existing) return { error: "Event not found." };

            const ownsEvent = existing.created_by === scope.user.id;
            const managesDept = existing.department_id && scope.managedDepartmentIds.includes(existing.department_id);
            if (!ownsEvent && !managesDept) {
                return { error: "You do not have permission to update this event." };
            }

            if (parsed.data.department_id && !scope.managedDepartmentIds.includes(parsed.data.department_id)) {
                return { error: "You can only assign events to your managed department." };
            }
        }

        const { data, error } = await supabase
            .from('events')
            .update(parsed.data)
            .eq('id', eventId.data)
            .select('id')
            .maybeSingle();

        if (error) {
            console.error("Update Event Error:", error);
            return { error: getMutationErrorMessage("update", error) };
        }

        if (!data) {
            return { error: "This event no longer exists or you do not have permission to update it." };
        }

        revalidatePath("/admin/events");
        revalidatePath("/admin/sessions");
        revalidatePath("/admin");
        return { success: true };
    } catch (e: unknown) {
        return { error: getErrorMessage(e) };
    }
}

export async function deleteEvent(id: string) {
    try {
        const scope = await requireAdminAuth();
        const supabase = await createClient();

        const eventId = eventIdSchema.safeParse(id);
        if (!eventId.success) return { error: "Invalid event selected." };

        // Production Lock: Prevent deleting events while a live session is active
        const { data: activeSession } = await supabase
            .from('attendance_sessions')
            .select('id')
            .eq('event_id', eventId.data)
            .eq('status', 'active')
            .maybeSingle();

        if (activeSession) {
            return { error: "Cannot delete this event while a live session is active. Please end the live session first." };
        }

        // Department Head boundary: can only delete events in their scope
        if (!scope.isSuperAdmin) {
            const { data: existing } = await supabase
                .from('events')
                .select('department_id, created_by')
                .eq('id', eventId.data)
                .maybeSingle();

            if (!existing) return { error: "Event not found." };

            const ownsEvent = existing.created_by === scope.user.id;
            const managesDept = existing.department_id && scope.managedDepartmentIds.includes(existing.department_id);
            if (!ownsEvent && !managesDept) {
                return { error: "You do not have permission to delete this event." };
            }
        }

        const { data, error } = await supabase
            .from('events')
            .delete()
            .eq('id', eventId.data)
            .select('id')
            .maybeSingle();

        if (error) {
            console.error("Delete Event Error:", error);
            return { error: getMutationErrorMessage("delete", error) };
        }

        if (!data) {
            return { error: "This event no longer exists or you do not have permission to delete it." };
        }

        revalidatePath("/admin/events");
        revalidatePath("/admin");
        return { success: true };
    } catch (e: unknown) {
        return { error: getErrorMessage(e) };
    }
}

import { sendCustomBroadcastEmail } from "@/lib/email";

export async function sendManualBroadcastEmail(payload: {
    eventTitle?: string;
    targetWorkerIds?: string[];
    subject: string;
    messageBody: string;
}) {
    try {
        const scope = await requireAdminAuth();
        const supabase = await createClient();

        if (!payload.subject?.trim()) {
            return { error: "Email subject is required." };
        }
        if (!payload.messageBody?.trim()) {
            return { error: "Email message body is required." };
        }

        // Fetch recipients based on targeting
        let profilesQuery = supabase
            .from("profiles")
            .select("id, first_name, last_name, department_id")
            .eq("role", "worker");

        if (!scope.isSuperAdmin) {
            profilesQuery = profilesQuery.in("department_id", scope.managedDepartmentIds);
        }

        if (payload.targetWorkerIds && payload.targetWorkerIds.length > 0) {
            profilesQuery = profilesQuery.in("id", payload.targetWorkerIds);
        }

        const { data: workerProfiles, error: profilesError } = await profilesQuery;

        if (profilesError || !workerProfiles || workerProfiles.length === 0) {
            return { error: "No eligible workers found for this email broadcast." };
        }

        // Fetch emails from auth.users (or profiles if stored there)
        const workerUserIds = workerProfiles.map((p) => p.id);
        const { createAdminClient } = await import("@/utils/supabase/admin");
        const adminSupabase = createAdminClient();

        // Fetch auth emails in a single request
        const { data: usersData, error: usersError } = await adminSupabase.auth.admin.listUsers({ perPage: 1000 });
        if (usersError) {
            console.error("[sendManualBroadcastEmail] Failed to fetch auth users:", usersError);
            return { error: `Failed to fetch recipient email details: ${usersError.message}` };
        }

        const emailMap = new Map<string, string>();
        usersData?.users?.forEach((u) => {
            if (u.id && u.email) {
                emailMap.set(u.id, u.email);
            }
        });

        // Filter valid workers with real email addresses (excluding system-generated placeholders)
        const validRecipients = workerProfiles.filter((w) => {
            const email = emailMap.get(w.id)?.toLowerCase().trim();
            if (!email) return false;
            if (email.startsWith("worker.") && email.endsWith("@harvestersng.org")) return false;
            return true;
        });

        if (validRecipients.length === 0) {
            return { error: "No confirmed email addresses found for the selected worker profiles." };
        }

        let sentCount = 0;
        let failCount = 0;

        // Process email dispatch in small chunks of 3 to respect Gmail SMTP connection limits and avoid socket timeouts
        const CHUNK_SIZE = 3;
        for (let i = 0; i < validRecipients.length; i += CHUNK_SIZE) {
            const chunk = validRecipients.slice(i, i + CHUNK_SIZE);
            const results = await Promise.all(
                chunk.map(async (worker) => {
                    const recipientEmail = emailMap.get(worker.id)!;
                    const personalizedBody = payload.messageBody
                        .replace(/\{\{first_name\}\}/gi, worker.first_name || "Worker")
                        .replace(/\{\{last_name\}\}/gi, worker.last_name || "")
                        .replace(/\{\{event_title\}\}/gi, payload.eventTitle || "Harvesters Event");

                    return sendCustomBroadcastEmail({
                        toEmail: recipientEmail,
                        firstName: worker.first_name || "Worker",
                        subject: payload.subject,
                        bodyMarkdownOrText: personalizedBody,
                        eventTitle: payload.eventTitle || "Harvesters Event",
                    });
                })
            );

            results.forEach((res) => {
                if (res.success) {
                    sentCount++;
                } else {
                    failCount++;
                }
            });
        }

        if (sentCount === 0) {
            return { error: `Failed to send email broadcast. ${failCount > 0 ? `${failCount} delivery attempt(s) failed.` : "No valid email recipients were reached."}` };
        }

        return {
            success: true,
            sentCount,
            failCount,
            message: `Successfully sent broadcast to ${sentCount} worker${sentCount === 1 ? "" : "s"}${failCount > 0 ? ` (${failCount} failed)` : ""}.`,
        };
    } catch (e: unknown) {
        if (typeof e === 'object' && e !== null && 'digest' in e && typeof (e as any).digest === 'string' && (e as any).digest.startsWith('NEXT_REDIRECT')) {
            throw e;
        }
        return { error: getErrorMessage(e) };
    }
}

