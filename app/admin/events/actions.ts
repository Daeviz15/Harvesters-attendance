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
        location_ids: formData.get("location_ids") ? JSON.parse(formData.get("location_ids") as string) : [],
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
        },
    };
}

// Industry standard: Verify admin role on EVERY server action securely
async function verifyAdminServer() {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) throw new Error("Unauthorized");

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (!profile || profile.role !== 'admin') {
        throw new Error("Forbidden: Admin access required");
    }

    return supabase;
}

export async function createEvent(formData: FormData) {
    try {
        const supabase = await verifyAdminServer();

        const parsed = parseEventFormData(formData);
        if ("error" in parsed) return { error: parsed.error };

        const { error } = await supabase
            .from('events')
            .insert([parsed.data]);

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
        const supabase = await verifyAdminServer();

        const eventId = eventIdSchema.safeParse(id);
        if (!eventId.success) return { error: "Invalid event selected." };

        const parsed = parseEventFormData(formData);
        if ("error" in parsed) return { error: parsed.error };

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
        revalidatePath("/admin");
        return { success: true };
    } catch (e: unknown) {
        return { error: getErrorMessage(e) };
    }
}

export async function deleteEvent(id: string) {
    try {
        const supabase = await verifyAdminServer();

        const eventId = eventIdSchema.safeParse(id);
        if (!eventId.success) return { error: "Invalid event selected." };
        
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
