import "server-only";

import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import type { AssistanceHistoryFilter, AssistanceHistoryPage } from "@/lib/types";

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
  activity: z.array(z.object({
    id: z.string().uuid(),
    actor_name: z.string(),
    status: z.enum(["open", "acknowledged", "resolved", "dismissed", "expired"]),
    note: z.string().nullable(),
    is_baseline: z.boolean(),
    created_at: z.string(),
  })),
});

const pageSchema = z.object({
  requests: z.array(assistanceRequestSchema),
  counts: z.object({
    all: z.number().int().nonnegative(),
    unresolved: z.number().int().nonnegative(),
    active: z.number().int().nonnegative(),
    resolved: z.number().int().nonnegative(),
    closed: z.number().int().nonnegative(),
  }),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});

export async function getAssistanceHistoryPage(
  status: AssistanceHistoryFilter,
  page: number,
  requestId: string | null,
): Promise<AssistanceHistoryPage> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_check_in_assistance_page", {
    p_status: status,
    p_page: page,
    p_limit: 25,
    p_request_id: requestId,
  });

  if (error) {
    console.error("[CheckInAssistance] Failed to load requests", {
      code: error.code,
      message: error.message,
    });
    throw new Error("Could not load complaint history. Please refresh and try again.");
  }

  const parsed = pageSchema.safeParse(data);
  if (!parsed.success) throw new Error("The complaint history response could not be loaded.");
  return parsed.data;
}
