import "server-only";

import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import type { CheckInAssistanceRequest } from "@/lib/types";

const assistanceRequestSchema = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid(),
  event_id: z.string().uuid(),
  event_title: z.string().min(1),
  user_id: z.string().uuid(),
  worker_name: z.string().min(1),
  worker_code: z.string().nullable(),
  department_name: z.string().nullable(),
  reported_status: z.enum(["low_accuracy", "not_confirmed", "unavailable"]),
  reported_accuracy_meters: z.number().finite().nullable(),
  nearest_location_name: z.string().nullable(),
  nearest_distance_meters: z.number().finite().nullable(),
  worker_message: z.string().nullable(),
  status: z.enum(["open", "acknowledged", "resolved", "dismissed", "expired"]),
  created_at: z.string(),
  acknowledged_at: z.string().nullable(),
  resolved_at: z.string().nullable(),
  resolution_note: z.string().nullable(),
});

export async function getCheckInAssistanceRequests(
  limit = 50,
): Promise<CheckInAssistanceRequest[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_check_in_assistance_requests", {
    p_limit: safeLimit,
  });

  if (error) {
    console.error("[CheckInAssistance] Failed to load requests", {
      code: error.code,
      message: error.message,
    });
    return [];
  }

  return (data ?? []).flatMap((row: unknown) => {
    const parsed = assistanceRequestSchema.safeParse(row);
    if (!parsed.success) {
      console.error("[CheckInAssistance] Ignored an invalid request row");
      return [];
    }
    return [parsed.data as CheckInAssistanceRequest];
  });
}
