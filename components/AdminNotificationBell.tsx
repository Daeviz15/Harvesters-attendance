"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  CalendarClock,
  Check,
  CheckCheck,
  MapPinned,
  UserCheck,
  UserX,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import type { AdminNotification } from "@/lib/types";

interface AdminNotificationBellProps {
  userId: string;
  initialNotifications: AdminNotification[];
  initialUnreadCount: number;
}

const notificationSelect =
  "id, recipient_user_id, event_type, actor_user_id, subject_user_id, title, message, action_url, read_at, created_at";

function isAdminNotification(value: unknown): value is AdminNotification {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.recipient_user_id === "string" &&
    typeof row.event_type === "string" &&
    typeof row.title === "string" &&
    typeof row.message === "string" &&
    typeof row.action_url === "string" &&
    /^\/admin(?:\/|$)/.test(row.action_url) &&
    (row.read_at === null || typeof row.read_at === "string") &&
    typeof row.created_at === "string"
  );
}

function NotificationIcon({ eventType }: { eventType: AdminNotification["event_type"] }) {
  if (eventType === "worker_deactivated") return <UserX className="h-4 w-4" />;
  if (eventType === "worker_reactivated") return <UserCheck className="h-4 w-4" />;
  if (eventType === "leave_returned_early") return <CheckCheck className="h-4 w-4" />;
  if (eventType === "check_in_assistance_requested") return <MapPinned className="h-4 w-4" />;
  return <CalendarClock className="h-4 w-4" />;
}

function formatNotificationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Africa/Lagos",
  }).format(date);
}

export default function AdminNotificationBell({
  userId,
  initialNotifications,
  initialUnreadCount,
}: AdminNotificationBellProps) {
  const supabase = useMemo(() => createClient(), []);
  const containerRef = useRef<HTMLDivElement>(null);
  const fetchInFlight = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);

  const refresh = useCallback(async () => {
    if (fetchInFlight.current) return;
    fetchInFlight.current = true;

    const [rowsResult, countResult] = await Promise.all([
      supabase
        .from("admin_notifications")
        .select(notificationSelect)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(20),
      supabase
        .from("admin_notifications")
        .select("id", { count: "exact", head: true })
        .is("read_at", null),
    ]);

    fetchInFlight.current = false;

    if (rowsResult.error || countResult.error) {
      console.error("[AdminNotifications] Refresh failed", {
        rowsError: rowsResult.error?.message,
        countError: countResult.error?.message,
      });
      return;
    }

    setNotifications((rowsResult.data ?? []).filter(isAdminNotification));
    setUnreadCount(Math.max(countResult.count ?? 0, 0));
  }, [supabase]);

  useEffect(() => {
    const channel = supabase
      .channel(`admin-notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "admin_notifications",
          filter: `recipient_user_id=eq.${userId}`,
        },
        (payload) => {
          if (!isAdminNotification(payload.new)) return;
          const incomingNotification = payload.new as AdminNotification;
          setNotifications((current) => [
            incomingNotification,
            ...current.filter((item) => item.id !== incomingNotification.id),
          ].slice(0, 20));
          setUnreadCount((current) => current + 1);
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void refresh();
      });

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 60_000);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const handleFocus = () => void refresh();
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleFocus);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
      void supabase.removeChannel(channel);
    };
  }, [refresh, supabase, userId]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const markRead = useCallback(async (ids: string[] | null) => {
    const affectedIds = ids ? new Set(ids) : null;
    const previouslyUnread = notifications.filter(
      (item) => !item.read_at && (!affectedIds || affectedIds.has(item.id)),
    ).length;
    const readAt = new Date().toISOString();

    setNotifications((current) =>
      current.map((item) =>
        !item.read_at && (!affectedIds || affectedIds.has(item.id))
          ? { ...item, read_at: readAt }
          : item,
      ),
    );
    setUnreadCount((current) =>
      affectedIds ? Math.max(0, current - previouslyUnread) : 0,
    );

    const { error } = await supabase.rpc("mark_my_admin_notifications_read", {
      p_notification_ids: ids,
    });
    if (error) {
      console.error("[AdminNotifications] Could not update read state", error.message);
      await refresh();
      return;
    }
    await refresh();
  }, [notifications, refresh, supabase]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 bg-white/70 text-neutral-600 transition-colors hover:bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#34A853] dark:border-white/10 dark:bg-white/5 dark:text-neutral-300 dark:hover:bg-white/10"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-background">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <section
          role="dialog"
          aria-label="Admin notifications"
          className="fixed inset-x-3 top-[4.75rem] z-[70] max-h-[min(34rem,calc(100vh-6rem))] overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#111113] sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[25rem]"
        >
          <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-white/10">
            <div>
              <h2 className="font-bold text-neutral-900 dark:text-white">Notifications</h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {unreadCount === 0 ? "You are all caught up" : `${unreadCount} unread`}
              </p>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markRead(null)}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-[#34A853] transition-colors hover:bg-[#34A853]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#34A853]"
              >
                <CheckCheck className="h-4 w-4" />
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[min(28rem,calc(100vh-10rem))] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <Bell className="mx-auto mb-3 h-7 w-7 text-neutral-400" />
                <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
                  No notifications yet
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  Important activity in your admin scope will appear here.
                </p>
              </div>
            ) : (
              notifications.map((notification) => (
                <Link
                  key={notification.id}
                  href={notification.action_url}
                  onClick={() => {
                    setIsOpen(false);
                    if (!notification.read_at) void markRead([notification.id]);
                  }}
                  className={`flex gap-3 border-b border-neutral-100 px-4 py-3.5 transition-colors last:border-b-0 hover:bg-neutral-50 dark:border-white/5 dark:hover:bg-white/5 ${
                    notification.read_at ? "" : "bg-[#34A853]/5"
                  }`}
                >
                  <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    notification.read_at
                      ? "bg-neutral-100 text-neutral-500 dark:bg-white/5 dark:text-neutral-400"
                      : "bg-[#34A853]/15 text-[#34A853]"
                  }`}>
                    <NotificationIcon eventType={notification.event_type} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2">
                      <span className="text-sm font-semibold text-neutral-900 dark:text-white">
                        {notification.title}
                      </span>
                      {!notification.read_at && (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#34A853]" />
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
                      {notification.message}
                    </span>
                    <span className="mt-1.5 flex items-center gap-1 text-[11px] text-neutral-400">
                      {notification.read_at && <Check className="h-3 w-3" />}
                      {formatNotificationTime(notification.created_at)}
                    </span>
                  </span>
                </Link>
              ))
            )}
          </div>
        </section>
      )}
    </div>
  );
}
