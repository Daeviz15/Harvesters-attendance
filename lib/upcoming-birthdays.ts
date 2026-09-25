import "server-only";

import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import type { UpcomingBirthday } from "@/lib/types";

const upcomingBirthdaySchema = z.object({
    first_name: z.string(),
    last_name: z.string(),
    avatar_url: z.string().nullable(),
    department_name: z.string(),
    birthday_month: z.coerce.number().int().min(1).max(12),
    birthday_day: z.coerce.number().int().min(1).max(31),
    next_birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    days_until: z.coerce.number().int().min(0).max(366),
});

export async function getUpcomingBirthdays({
    adminView = false,
    daysAhead = 45,
    limit = 8,
}: {
    adminView?: boolean;
    daysAhead?: number;
    limit?: number;
} = {}): Promise<UpcomingBirthday[]> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_upcoming_birthdays", {
        p_admin_view: adminView,
        p_days_ahead: daysAhead,
        p_limit: limit,
    });

    if (error) {
        console.error("[Birthdays] Failed to load scoped birthday announcements:", error);
        return [];
    }

    const parsed = z.array(upcomingBirthdaySchema).safeParse(data || []);
    if (!parsed.success) {
        console.error("[Birthdays] Database returned an invalid announcement payload.");
        return [];
    }

    return parsed.data;
}
