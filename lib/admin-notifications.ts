import "server-only";

import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import type { AdminNotification } from "@/lib/types";

const adminNotificationSchema = z.object({
  id: z.string().uuid(),
  recipient_user_id: z.string().uuid(),
  event_type: z.enum([
    "leave_requested",
    "leave_approved",
    "leave_rejected",
    "leave_returned_early",
    "worker_deactivated",
    "worker_reactivated",
  ]),
  actor_user_id: z.string().uuid().nullable(),
  subject_user_id: z.string().uuid().nullable(),
  title: z.string().min(1).max(120),
  message: z.string().min(1).max(500),
  action_url: z.string().regex(/^\/admin(?:\/|$)/).max(300),
  read_at: z.string().nullable(),
  created_at: z.string(),
});

export interface AdminNotificationSnapshot {
  notifications: AdminNotification[];
  unreadCount: number;
}

export async function getAdminNotificationSnapshot(
  limit = 20,
): Promise<AdminNotificationSnapshot> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 50);
  const supabase = await createClient();

  const [notificationsResult, unreadResult] = await Promise.all([
    supabase
      .from("admin_notifications")
      .select(
        "id, recipient_user_id, event_type, actor_user_id, subject_user_id, title, message, action_url, read_at, created_at",
      )
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(safeLimit),
    supabase
      .from("admin_notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null),
  ]);

  if (notificationsResult.error || unreadResult.error) {
    console.error("[AdminNotifications] Failed to load notification snapshot", {
      notificationsError: notificationsResult.error?.message,
      unreadError: unreadResult.error?.message,
    });
    return { notifications: [], unreadCount: 0 };
  }

  const notifications = (notificationsResult.data ?? []).flatMap((row) => {
    const parsed = adminNotificationSchema.safeParse(row);
    if (!parsed.success) {
      console.error("[AdminNotifications] Ignored an invalid notification row", {
        notificationId: typeof row.id === "string" ? row.id : "unknown",
      });
      return [];
    }
    return [parsed.data as AdminNotification];
  });

  return {
    notifications,
    unreadCount: Math.max(unreadResult.count ?? 0, 0),
  };
}
