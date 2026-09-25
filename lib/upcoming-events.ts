import "server-only";

import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import type { UpcomingEvent } from "@/lib/types";

const upcomingEventRowSchema = z.object({
    event_id: z.string().uuid(),
    event_title: z.string().min(1).max(120),
    scheduled_start_at: z.string().datetime({ offset: true }),
    scheduled_end_at: z.string().datetime({ offset: true }),
    occurrence_key: z.string().min(1).max(200),
    event_timezone: z.string().min(1).max(80),
    location_name: z.string().nullable(),
    is_in_progress: z.boolean(),
});

export async function getMyNextEventOccurrence({
    referenceTime,
    horizonDays = 366,
}: {
    referenceTime: string;
    horizonDays?: number;
}): Promise<UpcomingEvent | null> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_my_next_event_occurrence", {
        p_reference_time: referenceTime,
        p_horizon_days: horizonDays,
    });

    if (error) {
        console.error("[UpcomingEvents] Failed to load the next scoped event occurrence:", error);
        return null;
    }

    const parsed = z.array(upcomingEventRowSchema).max(1).safeParse(data || []);
    if (!parsed.success) {
        console.error("[UpcomingEvents] Database returned an invalid event occurrence payload.");
        return null;
    }

    const row = parsed.data[0];
    if (!row) return null;

    return {
        eventId: row.event_id,
        title: row.event_title,
        scheduledStartAt: row.scheduled_start_at,
        scheduledEndAt: row.scheduled_end_at,
        occurrenceKey: row.occurrence_key,
        timezone: row.event_timezone,
        locationName: row.location_name,
        isInProgress: row.is_in_progress,
    };
}
