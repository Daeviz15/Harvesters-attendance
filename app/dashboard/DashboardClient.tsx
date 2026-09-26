"use client";

import { useState, useEffect, useTransition, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    MapPin, Calendar, CheckCircle2,
    CircleDashed, LogOut, Menu, X, CalendarDays,
    AlertTriangle, Loader2, History, Crown, CalendarX2, RotateCcw, RefreshCw,
    HelpCircle, Send, ShieldCheck, Clock
} from "lucide-react";
import LeaveRequestModal from "@/components/LeaveRequestModal";
import LoadingOverlay from "@/components/LoadingOverlay";
import { logout } from "@/app/auth/actions";
import { verifyAndCheckIn, fetchAttendanceHistory, checkSessionAlive, checkHasLiveSession, endMyLeaveEarly, requestCheckInAssistance, fetchMyAssistanceStatus } from "./actions";
import { useGeolocation } from "@/hooks/useGeolocation";
import ThemeToggle from "@/components/ThemeToggle";
import type { AttendanceLog, UpcomingBirthday, UpcomingEvent } from "@/lib/types";
import { createClient } from "@/utils/supabase/client";
import BirthdayPrompt from "@/components/BirthdayPrompt";
import { UpcomingBirthdaysSidebar } from "@/components/BirthdayAnnouncements";
import UpcomingEventCountdown from "@/components/UpcomingEventCountdown";

/**
 * Formats an ISO timestamp into a human-friendly relative date.
 * Returns "Today", "Yesterday", or a formatted date like "Mon, Jun 12".
 */
function formatRelativeDate(isoString: string): string {
    const date = new Date(isoString);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const targetDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffMs = today.getTime() - targetDay.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";

    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Formats an ISO timestamp into 12-hour time like "08:45 AM". */
function formatTime12h(isoString: string): string {
    return new Date(isoString).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    });
}

interface SidebarContentProps {
    setIsMobileMenuOpen: (open: boolean) => void;
    setIsLeaveModalOpen: (open: boolean) => void;
    username: string;
    workerId?: string | null;
    initials: string;
    department: string;
    team: string | null;
    avatarUrl?: string | null;
    headDepartmentName: string | null;
    canAccessAdmin: boolean;
    history: AttendanceLog[];
    hasMore: boolean;
    isLoadingMore: boolean;
    onLoadMore: () => void;
    upcomingBirthdays: UpcomingBirthday[];
}

const SidebarContent = ({ setIsMobileMenuOpen, setIsLeaveModalOpen, username, workerId, initials, department, team, avatarUrl, headDepartmentName, canAccessAdmin, history, hasMore, isLoadingMore, onLoadMore, upcomingBirthdays }: SidebarContentProps) => (
    <div className="flex flex-col h-full w-full">
        <div className="flex items-center justify-between mb-12">
            <div className="relative h-12 w-28 -ml-2">
                <Image
                    src="/logo.png"
                    alt="Harvesters Logo"
                    fill
                    sizes="112px"
                    className="object-contain object-left opacity-90 dark:invert-0 invert transition-all"
                    priority
                />
            </div>
            <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="md:hidden p-2 text-neutral-500 hover:text-neutral-800 dark:text-white/50 dark:hover:text-white"
            >
                <X className="w-5 h-5" />
            </button>
        </div>

        <div className="flex items-center gap-4 p-4 rounded-2xl bg-neutral-200/50 dark:bg-white/5 border border-neutral-300 dark:border-white/10 mb-10 min-w-0">
            <div className="w-12 h-12 rounded-full bg-[#34A853]/20 border border-[#34A853]/30 flex items-center justify-center text-lg font-bold text-[#34A853] shrink-0 relative overflow-hidden">
                {avatarUrl ? (
                    <Image src={avatarUrl} alt={username} fill unoptimized className="object-cover" sizes="48px" />
                ) : (
                    initials
                )}
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-neutral-800 dark:text-white/90 truncate" title={workerId ? `${username} (${workerId})` : username}>
                    {username}
                    {workerId && (
                        <span className="ml-1.5 text-[11px] font-mono font-normal text-neutral-500 dark:text-white/60">
                            ({workerId})
                        </span>
                    )}
                </p>
                <p className="text-[12px] text-[#34A853] tracking-widest uppercase font-medium truncate" title={department}>
                    {team ? `${team} \u2022 ` : ""}{department}
                </p>
                {headDepartmentName && (
                    <div className="mt-1 inline-flex max-w-full items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                        <Crown className="w-3 h-3 shrink-0" />
                        <span className="truncate" title={`${headDepartmentName} Head`}>Department Head</span>
                    </div>
                )}
            </div>
        </div>

        {canAccessAdmin && (
            <Link
                href="/admin"
                onClick={() => setIsMobileMenuOpen(false)}
                className="mb-8 inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#34A853] hover:text-[#2e9347] transition-colors"
            >
                <Crown className="w-4 h-4" />
                Switch to Admin
            </Link>
        )}

        <UpcomingBirthdaysSidebar birthdays={upcomingBirthdays} />

        <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-[11px] font-semibold text-neutral-500 dark:text-white/50 uppercase tracking-[0.2em]">Your History</h3>
            </div>

            <div data-lenis-prevent className="space-y-4 overflow-y-auto pr-2 no-scrollbar flex-1">
                {history.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 gap-3">
                        <History className="w-8 h-8 text-neutral-300 dark:text-white/15" />
                        <p className="text-[13px] text-neutral-400 dark:text-white/30 text-center">No attendance records yet.<br />Check in to get started.</p>
                    </div>
                ) : (
                    <>
                        {history.map((log) => (
                            <div key={log.id} className="w-full flex items-start gap-4 group">
                                <div className="w-9 h-9 rounded-full bg-neutral-200/50 dark:bg-white/5 border border-neutral-300 dark:border-white/10 flex items-center justify-center mt-1 group-hover:bg-neutral-200/80 dark:group-hover:bg-white/10 transition-colors">
                                    <Calendar className="w-3.5 h-3.5 text-neutral-400 dark:text-white/40" />
                                </div>
                                <div className="flex-1 border-b border-neutral-200 dark:border-white/5 pb-4">
                                    <div className="flex justify-between items-start mb-1">
                                        <p className="text-[14px] font-medium text-neutral-800 dark:text-white/80">{formatRelativeDate(log.check_in_time)}</p>
                                        {log.status === 'active' ? (
                                            <CircleDashed className="w-3.5 h-3.5 text-orange-400 animate-spin mt-0.5" />
                                        ) : (
                                            <CheckCircle2 className="w-3.5 h-3.5 text-[#34A853] mt-0.5" />
                                        )}
                                    </div>
                                    <p className="text-[12px] text-neutral-500 dark:text-white/40 font-mono">
                                        {formatTime12h(log.check_in_time)} — {log.check_out_time ? formatTime12h(log.check_out_time) : '--:--'}
                                    </p>
                                </div>
                            </div>
                        ))}
                        {hasMore && (
                            <button
                                onClick={onLoadMore}
                                disabled={isLoadingMore}
                                className="w-full flex items-center justify-center gap-2 py-3 text-[12px] font-medium text-neutral-500 hover:text-[#34A853] dark:text-white/40 dark:hover:text-[#34A853] transition-colors rounded-xl hover:bg-neutral-100 dark:hover:bg-white/5"
                            >
                                {isLoadingMore ? (
                                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading...</>
                                ) : (
                                    'Load More'
                                )}
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>

        <div className="pt-6 mt-auto space-y-2">
            <button
                onClick={() => {
                    setIsLeaveModalOpen(true);
                    setIsMobileMenuOpen(false);
                }}
                className="flex items-center gap-3 text-neutral-500 hover:text-[#34A853] dark:text-white/50 dark:hover:text-[#34A853] transition-colors py-3 group w-full"
            >
                <CalendarDays className="w-5 h-5 group-hover:scale-110 transition-transform" />
                <span className="text-[13px] font-semibold tracking-wider uppercase">Request Leave</span>
            </button>
            <button onClick={() => logout()} className="flex items-center gap-3 text-neutral-500 hover:text-red-500 dark:text-white/50 dark:hover:text-red-400 transition-colors py-3 group w-full text-left">
                <LogOut className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                <span className="text-[13px] font-semibold tracking-wider uppercase">Log Out</span>
            </button>
        </div>
    </div>
);

interface DashboardClientProps {
    userId: string;
    username: string;
    workerId?: string | null;
    initials: string;
    department: string;
    team: string | null;
    avatarUrl?: string | null;
    initialIsCheckedIn: boolean;
    initialCheckedInAt: string | null;
    initialHistory: AttendanceLog[];
    initialHasMore: boolean;
    // initialLiveFeed: LiveFeedEvent[]; // COMMENTED OUT: Live Feed disabled per team request
    initialBroadcastSession: { id: string, title: string, locationIds: string[] } | null;
    upcomingEvent: UpcomingEvent | null;
    serverNow: string;
    activeLocations: {
        id: string;
        name: string;
        latitude: number;
        longitude: number;
        radius: number;
        max_check_in_accuracy_meters?: number | null;
        check_in_distance_buffer_meters?: number | null;
    }[];
    headDepartmentName: string | null;
    shouldPromptForBirthday: boolean;
    canAccessAdmin: boolean;
    initialActiveLeave: {
        id: string;
        leaveType: string;
        startDate: string;
        endDate: string;
    } | null;
    upcomingBirthdays: UpcomingBirthday[];
    initialAssistanceRequest?: {
        id: string;
        status: string;
        worker_message: string | null;
        resolution_note: string | null;
        created_at: string;
        resolved_at: string | null;
    } | null;
}

export default function DashboardClient({
    userId, username, workerId, initials, department, team, avatarUrl,
    initialIsCheckedIn, initialCheckedInAt,
    initialHistory, initialHasMore, /* initialLiveFeed, */ initialBroadcastSession,
    upcomingEvent, serverNow,
    activeLocations, headDepartmentName, shouldPromptForBirthday, canAccessAdmin,
    initialActiveLeave, upcomingBirthdays, initialAssistanceRequest
}: DashboardClientProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    const [isCheckedIn, setIsCheckedIn] = useState(initialIsCheckedIn);
    const [checkedInAt, setCheckedInAt] = useState<string | null>(initialCheckedInAt);
    const [broadcastSession, setBroadcastSession] = useState<{ id: string, title: string, locationIds: string[] } | null>(initialBroadcastSession);
    // Do not collect a worker's position until an event is actively accepting
    // check-ins. This limits location processing to its stated purpose.
    const geo = useGeolocation(activeLocations, !!broadcastSession && !initialActiveLeave);

    const [actionError, setActionError] = useState<string | null>(null);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
    const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
    const [isAssistanceModalOpen, setIsAssistanceModalOpen] = useState(false);
    const [assistanceMessage, setAssistanceMessage] = useState("");
    const [assistanceError, setAssistanceError] = useState<string | null>(null);
    const [assistanceFeedback, setAssistanceFeedback] = useState<string | null>(null);
    const [assistanceRequest, setAssistanceRequest] = useState(initialAssistanceRequest || null);
    const hasActiveAssistance = assistanceRequest !== null && (assistanceRequest.status === "open" || assistanceRequest.status === "acknowledged");
    const [assistanceBannerDismissed, setAssistanceBannerDismissed] = useState(false);
    const [returnNote, setReturnNote] = useState("");
    const [returnError, setReturnError] = useState<string | null>(null);
    const [isSubmittingAssistance, setIsSubmittingAssistance] = useState(false);
    const [isSubmittingReturn, setIsSubmittingReturn] = useState(false);
    const [pendingAction, setPendingAction] = useState<"check-in" | null>(null);
    const [gracePeriodRemaining] = useState<number | null>(null);
    const [gpsWaitingTooLong, setGpsWaitingTooLong] = useState(false);

    // Attendance history state (cursor-based pagination)
    const [history, setHistory] = useState<AttendanceLog[]>(initialHistory);
    const [hasMore, setHasMore] = useState(initialHasMore);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    // Live feed state — COMMENTED OUT: Live Feed disabled per team request
    // const [liveFeed, setLiveFeed] = useState<LiveFeedEvent[]>(initialLiveFeed);

    // Refs for timer logic to avoid constant interval recreation
    const geoRef = useRef(geo);
    const isCheckedInRef = useRef(isCheckedIn);
    const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Keep refs synced with state
    useEffect(() => { geoRef.current = geo; }, [geo]);
    useEffect(() => { isCheckedInRef.current = isCheckedIn; }, [isCheckedIn]);

    // Track when GPS has been loading for more than 15 seconds so we can
    // surface the "Notify a leader" button earlier for frustrated workers.
    useEffect(() => {
        if (!geo.isLoading) {
            setGpsWaitingTooLong(false);
            return;
        }
        const timer = setTimeout(() => setGpsWaitingTooLong(true), 15_000);
        return () => clearTimeout(timer);
    }, [geo.isLoading]);

    const refreshDashboard = useCallback(() => {
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = setTimeout(() => {
            router.refresh();
        }, 150);
    }, [router]);

    useEffect(() => {
        return () => {
            if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        };
    }, []);

    /**
     * Loads the next page of attendance history using cursor-based pagination.
     * Uses the last loaded item's check_in_time + id as the cursor.
     */
    const handleLoadMore = useCallback(async () => {
        if (isLoadingMore || !hasMore || history.length === 0) return;
        setIsLoadingMore(true);
        try {
            const lastItem = history[history.length - 1];
            const result = await fetchAttendanceHistory(lastItem.check_in_time, lastItem.id);
            setHistory(prev => [...prev, ...result.logs]);
            setHasMore(result.hasMore);
        } catch (err) {
            console.error('Failed to load more history:', err);
        } finally {
            setIsLoadingMore(false);
        }
    }, [isLoadingMore, hasMore, history]);

    /**
     * Refreshes the entire history from the beginning after a check-in or check-out.
     * This ensures the sidebar always reflects the latest state.
     */
    const refreshHistory = useCallback(async () => {
        try {
            const result = await fetchAttendanceHistory();
            setHistory(result.logs);
            setHasMore(result.hasMore);
        } catch (err) {
            console.error('Failed to refresh history:', err);
        }
    }, []);

    // Setup Supabase Realtime subscriptions
    useEffect(() => {
        const supabase = createClient();

        const channel = supabase.channel('dashboard-realtime')
            // COMMENTED OUT: Live Feed realtime subscription disabled per team request
            // .on('postgres_changes', {
            //     event: 'INSERT',
            //     schema: 'public',
            //     table: 'live_feed_events'
            // }, (payload) => {
            //     const newEvent = payload.new as LiveFeedEvent;
            //     setLiveFeed(prev => [newEvent, ...prev].slice(0, 50));
            // })
            // Listen to personal attendance logs (cross-device sync & auto-checkout)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'attendance_logs',
                filter: `user_id=eq.${userId}`
            }, (payload) => {
                if (payload.eventType === 'INSERT') {
                    if (payload.new.status === 'active' && payload.new.session_id === broadcastSession?.id) {
                        setIsCheckedIn(true);
                        setCheckedInAt(payload.new.check_in_time ?? null);
                    }
                } else if (payload.eventType === 'UPDATE') {
                    if (payload.new.session_id === broadcastSession?.id && payload.new.status !== 'active') {
                        setIsCheckedIn(false);
                        setCheckedInAt(null);
                    }
                }
                refreshHistory();
            })
            // Listen to admin broadcast sessions (to unlock/lock check-in)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'attendance_sessions'
            }, (payload) => {
                if (payload.eventType === 'UPDATE' && payload.new.status !== 'active') {
                    setBroadcastSession(null);
                }
                refreshDashboard();
            })
            // Keep leave state synchronized when an administrator approves a
            // request or the worker resumes duty from another device.
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'leave_requests',
                filter: `user_id=eq.${userId}`
            }, () => {
                refreshDashboard();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [userId, broadcastSession?.id, refreshHistory, refreshDashboard]);

    // Polling heartbeat: verify broadcast session is still alive every 60 seconds.
    // This is the ultimate safety net — even if WebSockets fail, the UI will
    // self-correct within 60 seconds. Only polls when the tab is visible to
    // save battery and serverless invocations on backgrounded worker phones.
    useEffect(() => {
        if (!broadcastSession) return;

        const poll = async () => {
            if (document.visibilityState !== 'visible') return; // Skip if tab is backgrounded
            try {
                const isAlive = await checkSessionAlive(broadcastSession.id);
                if (!isAlive) {
                    setBroadcastSession(null);
                }
            } catch (e) {
                // Network error — don't clear, just skip this tick
                console.warn('[Heartbeat] Failed to verify session:', e);
            }
        };

        const interval = setInterval(poll, 60_000); // 60 seconds

        // Also poll immediately when the tab becomes visible again (e.g. worker
        // switches back from another app). This catches sessions that ended
        // while the phone was locked or the browser was in the background.
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') poll();
        };
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [broadcastSession]);

    // Auto-detection when awaiting live events:
    // If no broadcast is active, listen for tab visibility/focus and poll lightly
    // so workers and admins see newly started events instantly without manual browser refresh.
    useEffect(() => {
        if (broadcastSession) return;

        let isChecking = false;
        const checkLive = async () => {
            if (isChecking || document.visibilityState !== 'visible') return;
            isChecking = true;
            try {
                const hasLive = await checkHasLiveSession();
                if (hasLive) {
                    refreshDashboard();
                }
            } catch (err) {
                console.warn('[SessionDiscovery] Check failed:', err);
            } finally {
                isChecking = false;
            }
        };

        // Check immediately on mount/state switch
        checkLive();

        // Check whenever the worker returns to the browser tab or window gains focus
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') checkLive();
        };
        const handleFocus = () => checkLive();

        document.addEventListener('visibilitychange', handleVisibility);
        window.addEventListener('focus', handleFocus);

        // Light polling interval while awaiting session (10s when tab is active)
        const interval = setInterval(checkLive, 10_000);

        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibility);
            window.removeEventListener('focus', handleFocus);
        };
    }, [broadcastSession, refreshDashboard]);

    const formatTime = (totalSeconds: number) => {
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        if (h > 0) return `${h}h ${m}m ${s}s`;
        return `${m}m ${s}s`;
    };

    const handleCheckIn = () => {
        setActionError(null);

        if (initialActiveLeave) {
            setActionError("You are currently on approved leave. Resume duty before checking in.");
            return;
        }

        if (!broadcastSession) {
            setActionError("There is no active session to check into.");
            return;
        }

        if (geo.isLoading) {
            setActionError("Waiting for GPS coordinates to check in...");
            return;
        }
        if (geo.lat === null || geo.lng === null) {
            setActionError("GPS coordinates are required to check in.");
            return;
        }
        if (geo.accuracy === null || geo.positionTimestamp === null || !geo.isWithinPerimeter) {
            setActionError("We need a fresh, accurate location confirmation before you can check in.");
            return;
        }

        const formData = new FormData();
        formData.append("sessionId", broadcastSession.id);
        formData.append("lat", geo.lat.toString());
        formData.append("lng", geo.lng.toString());
        formData.append("accuracy", geo.accuracy.toString());
        const effectiveTimestamp = Math.max(geo.positionTimestamp, Date.now() - 30_000);
        formData.append("positionTimestamp", effectiveTimestamp.toString());

        setPendingAction("check-in");
        startTransition(async () => {
            try {
                const res = await verifyAndCheckIn(formData);
                if (res.error) {
                    setActionError(res.error);
                    // If the server says the session is dead, immediately nuke the broadcast UI
                    if (res.error.includes('no longer active')) {
                        setBroadcastSession(null);
                    }
                } else {
                    setIsCheckedIn(true);
                    setCheckedInAt(res.checkedInAt);
                    refreshHistory();
                }
            } finally {
                setPendingAction(null);
            }
        });
    };

    const handleEndLeaveEarly = async () => {
        if (!initialActiveLeave || isSubmittingReturn) return;

        setReturnError(null);
        const formData = new FormData();
        formData.set("leaveRequestId", initialActiveLeave.id);
        formData.set("returnNote", returnNote);

        setIsSubmittingReturn(true);
        try {
            const result = await endMyLeaveEarly(formData);
            if (result.error) {
                setReturnError(result.error);
                return;
            }

            setIsReturnModalOpen(false);
            setReturnNote("");
            router.refresh();
        } catch (err: unknown) {
            setReturnError(err instanceof Error ? err.message : "Failed to resume duty. Please try again.");
        } finally {
            setIsSubmittingReturn(false);
        }
    };

    const handleRequestAssistance = async () => {
        if (!broadcastSession || isSubmittingAssistance || initialActiveLeave || isCheckedIn || hasActiveAssistance) return;

        const reportedStatus = geo.confirmationStatus === 'low_accuracy'
            || geo.confirmationStatus === 'not_confirmed'
            || geo.confirmationStatus === 'unavailable'
            ? geo.confirmationStatus
            : 'unavailable';

        const formData = new FormData();
        formData.set('sessionId', broadcastSession.id);
        formData.set('reportedStatus', reportedStatus);
        formData.set('workerMessage', assistanceMessage);
        if (geo.lat !== null) formData.set('lat', geo.lat.toString());
        if (geo.lng !== null) formData.set('lng', geo.lng.toString());
        if (geo.accuracy !== null) formData.set('reportedAccuracyMeters', geo.accuracy.toString());
        if (geo.locationId) formData.set('nearestLocationId', geo.locationId);
        if (geo.distance !== null) formData.set('nearestDistanceMeters', geo.distance.toString());
        if (geo.positionTimestamp !== null) formData.set('positionTimestamp', geo.positionTimestamp.toString());

        setAssistanceError(null);
        setIsSubmittingAssistance(true);
        try {
            const result = await requestCheckInAssistance(formData);
            if (result.error) {
                setAssistanceError(result.error);
                return;
            }

            setIsAssistanceModalOpen(false);
            setAssistanceMessage("");
            setAssistanceBannerDismissed(false);
            setAssistanceRequest({
                id: result.requestId || 'active',
                status: 'open',
                worker_message: assistanceMessage || null,
                resolution_note: null,
                created_at: new Date().toISOString(),
                resolved_at: null,
            });
            setAssistanceFeedback(result.alreadyOpen
                ? 'Your event leaders already have an open request from you for this event.'
                : 'Your check-in problem was sent to the event leaders. This request does not record attendance.');
        } catch (err: unknown) {
            setAssistanceError(err instanceof Error ? err.message : "Failed to send assistance request. Please try again.");
        } finally {
            setIsSubmittingAssistance(false);
        }
    };

    // Polling for leader updates on assistance request (e.g. resolution note or proxy check-in)
    useEffect(() => {
        if (!broadcastSession || isCheckedIn) return;
        if (!assistanceRequest || (assistanceRequest.status !== 'open' && assistanceRequest.status !== 'acknowledged')) {
            return;
        }

        const interval = setInterval(async () => {
            try {
                const res = await fetchMyAssistanceStatus(broadcastSession.id);
                if (res.request) {
                    setAssistanceRequest((prev) => {
                        if (!prev || prev.status !== res.request?.status || prev.resolution_note !== res.request?.resolution_note) {
                            setAssistanceBannerDismissed(false);
                        }
                        return res.request;
                    });
                }
                if (res.isCheckedIn) {
                    setIsCheckedIn(true);
                    if (res.checkedInAt) setCheckedInAt(res.checkedInAt);
                    refreshHistory();
                }
            } catch (err) {
                console.error("[Dashboard] Error polling assistance status:", err);
            }
        }, 6000);

        return () => clearInterval(interval);
    }, [broadcastSession, isCheckedIn, assistanceRequest, refreshHistory]);

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return "Good Morning";
        if (hour < 18) return "Good Afternoon";
        return "Good Evening";
    };

    return (
        <main className="min-h-screen w-full bg-background text-foreground relative overflow-hidden font-sans flex transition-colors duration-300">
            <LoadingOverlay
                isOpen={isPending && pendingAction === "check-in"}
                text="Checking in..."
            />

            {/* Ambient Background Glow */}
            <div className="absolute inset-0 pointer-events-none opacity-20 z-0">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/10 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-[150px]"></div>
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-[#34A853]/5 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-[150px]"></div>
            </div>

            {/* Desktop Sidebar */}
            <aside className="hidden md:flex w-80 h-screen border-r border-neutral-200 dark:border-white/10 bg-neutral-100/40 dark:bg-black/40 backdrop-blur-xl p-8 flex-col relative z-20">
                <SidebarContent setIsMobileMenuOpen={setIsMobileMenuOpen} setIsLeaveModalOpen={setIsLeaveModalOpen} username={username} workerId={workerId} initials={initials} department={department} team={team} avatarUrl={avatarUrl} headDepartmentName={headDepartmentName} canAccessAdmin={canAccessAdmin} history={history} hasMore={hasMore} isLoadingMore={isLoadingMore} onLoadMore={handleLoadMore} upcomingBirthdays={upcomingBirthdays} />
            </aside>

            {/* Mobile Drawer */}
            <AnimatePresence>
                {isMobileMenuOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsMobileMenuOpen(false)}
                            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
                        />
                        <motion.aside
                            initial={{ x: "-100%" }}
                            animate={{ x: 0 }}
                            exit={{ x: "-100%" }}
                            transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                            className="fixed inset-y-0 left-0 w-[280px] bg-neutral-50 dark:bg-[#0f0f0f] border-r border-neutral-200 dark:border-white/10 p-6 flex flex-col z-50 md:hidden shadow-2xl"
                        >
                            <SidebarContent
                                setIsMobileMenuOpen={setIsMobileMenuOpen}
                                setIsLeaveModalOpen={setIsLeaveModalOpen}
                                username={username}
                                workerId={workerId}
                                initials={initials}
                                department={department}
                                team={team}
                                avatarUrl={avatarUrl}
                                headDepartmentName={headDepartmentName}
                                canAccessAdmin={canAccessAdmin}
                                history={history}
                                hasMore={hasMore}
                                isLoadingMore={isLoadingMore}
                                onLoadMore={handleLoadMore}
                                upcomingBirthdays={upcomingBirthdays}
                            />
                        </motion.aside>
                    </>
                )}
            </AnimatePresence>

            {/* Main Content */}
            <div
                data-lenis-prevent
                className="relative z-10 flex h-screen flex-1 flex-col overflow-y-auto overflow-x-hidden pt-20 scroll-smooth dashboard-desktop-scroll md:pt-0"
            >

                {/* Grace Period Warning Banner */}
                <AnimatePresence>
                    {gracePeriodRemaining !== null && (
                        <motion.div
                            initial={{ y: -50, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: -50, opacity: 0 }}
                            className="sticky top-20 z-30 flex w-full items-center justify-center gap-2 border-b border-orange-500/20 bg-orange-500/10 px-6 py-2.5 backdrop-blur-md md:top-0"
                        >
                            <AlertTriangle className="w-4 h-4 text-orange-400 animate-pulse" />
                            <span className="text-[13px] font-medium text-orange-400 tracking-wide">
                                You&apos;ve moved away from the venue! Auto-checkout in <span className="font-bold">{formatTime(gracePeriodRemaining)}</span>.
                            </span>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Mobile Header */}
                <div className="fixed inset-x-0 top-0 z-30 flex h-20 items-center justify-between border-b border-neutral-200/80 bg-background/90 px-6 backdrop-blur-xl dark:border-white/10 md:hidden">
                    <button
                        onClick={() => setIsMobileMenuOpen(true)}
                        className="p-2 -ml-2 text-neutral-600 hover:text-neutral-900 dark:text-white/70 dark:hover:text-white"
                        aria-label="Open worker navigation"
                    >
                        <Menu className="w-6 h-6" />
                    </button>
                    <div className="flex items-center gap-4">
                        <ThemeToggle />
                        <div className="w-8 h-8 rounded-full bg-[#34A853]/20 border border-[#34A853]/30 flex items-center justify-center text-xs font-bold text-[#34A853]">
                            {initials}
                        </div>
                    </div>
                </div>

                <div className="flex-1 w-full px-4 sm:px-6 md:pl-0 md:pr-6 lg:pr-8 pt-0 md:pt-0 pb-6 flex flex-col min-h-0">
                    {/* Contained Dashed Green Border Frame (Desktop Only): begins directly at the sidebar line on the left and extends to the top */}
                    <div className="w-full md:rounded-l-none md:rounded-r-2xl md:border-2 md:border-dashed md:border-[#34A853]/35 md:-ml-[1px] md:bg-neutral-500/[0.02] dark:md:bg-white/[0.015] p-3 sm:p-4 md:pt-8 md:pb-6 md:pl-8 md:pr-6 lg:pl-10 lg:pr-8 transition-all flex flex-col flex-1 relative">
                        {/* Desktop Header: theme toggle inside the top right of the frame */}
                        <div className="hidden md:flex items-center justify-end h-12 mb-12 relative z-20 shrink-0">
                            <ThemeToggle />
                        </div>

                        {/* Left Column: Action & Welcome */}
                        <div className="flex-1 flex flex-col">
                        <div className="mb-3 md:mb-4">
                            <h1 className="text-[22px] md:text-[26px] font-bold tracking-tight text-neutral-800 dark:text-white/90 mb-2 leading-snug flex flex-wrap items-center gap-x-2.5 gap-y-2">
                                <span suppressHydrationWarning>{getGreeting()}, {username}</span>
                                {workerId && (
                                    <span className="text-xs md:text-sm font-mono font-normal text-neutral-500 dark:text-white/60 bg-neutral-200/60 dark:bg-white/10 px-2 py-0.5 rounded-md align-middle">
                                        {workerId}
                                    </span>
                                )}
                                <span>!</span>
                            </h1>
                            <p className="text-[13px] md:text-[14px] text-neutral-500 dark:text-white/50 leading-relaxed">Ready to serve today? Mark your attendance below.</p>
                        </div>

                        {initialActiveLeave && (
                            <div className="mb-6 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4">
                                <div className="flex items-start gap-3">
                                    <div className="mt-0.5 rounded-xl bg-amber-500/15 p-2 text-amber-600 dark:text-amber-400">
                                        <CalendarX2 className="h-5 w-5" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-bold text-amber-700 dark:text-amber-300">
                                            You are currently on approved leave
                                        </p>
                                        <p className="mt-1 text-sm leading-6 text-amber-700/80 dark:text-amber-200/70">
                                            {initialActiveLeave.leaveType} through {initialActiveLeave.endDate}. Check-in is unavailable while this leave is active.
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setReturnError(null);
                                                setIsReturnModalOpen(true);
                                            }}
                                            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-black transition hover:bg-amber-400"
                                        >
                                            <RotateCcw className="h-4 w-4" />
                                            Resume Duty Early
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {!broadcastSession && (
                            <UpcomingEventCountdown
                                key={upcomingEvent?.occurrenceKey ?? "no-upcoming-event"}
                                event={upcomingEvent}
                                serverNow={serverNow}
                            />
                        )}

                        {broadcastSession && (
                            <div className="mb-3 max-w-xl rounded-xl border border-[#34A853]/25 bg-[#34A853]/5 px-3.5 py-2.5">
                                <div className="flex items-center gap-2.5">
                                    <div className="rounded-lg bg-[#34A853]/10 p-1.5 text-[#34A853] shrink-0">
                                        <CalendarDays className="h-3.5 w-3.5" />
                                    </div>
                                    <div className="min-w-0 flex-1 flex flex-wrap items-baseline gap-x-2 gap-y-1.5">
                                        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#34A853] shrink-0">
                                            Active event:
                                        </span>
                                        <span className="text-sm md:text-[15px] font-bold text-neutral-900 dark:text-white truncate leading-snug">
                                            {broadcastSession.title}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Status Pill */}
                        <div className="flex justify-start mb-3">
                            <motion.div
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border backdrop-blur-md transition-colors ${initialActiveLeave
                                    ? "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                    : !broadcastSession || geo.isLoading
                                        ? "bg-neutral-200/50 dark:bg-white/5 border-neutral-300 dark:border-white/10 text-neutral-500 dark:text-white/50"
                                        : geo.isWithinPerimeter
                                            ? "bg-[#34A853]/10 border-[#34A853]/20 text-[#34A853]"
                                            : geo.confirmationStatus === 'low_accuracy'
                                                ? "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                                : "bg-red-500/10 border-red-500/20 text-red-500 dark:text-red-400"
                                    }`}
                            >
                                <MapPin className="w-3.5 h-3.5" />
                                <span className="text-[12px] font-medium tracking-wide">
                                    {initialActiveLeave
                                        ? "Location paused while on leave"
                                        : !broadcastSession
                                            ? "Location is checked when an event starts"
                                            : geo.isLoading
                                            ? "Finding your location…"
                                            : geo.isWithinPerimeter
                                                ? `You're at ${geo.locationName}`
                                                : geo.confirmationStatus === 'low_accuracy'
                                                    ? "Getting a more accurate reading…"
                                                    : geo.confirmationStatus === 'not_confirmed'
                                                        ? (geo.distance !== null && geo.distance > 0
                                                            ? `You're about ${geo.distance > 1000 ? `${(geo.distance / 1000).toFixed(1)} km` : `${Math.round(geo.distance)} m`} from ${geo.locationName || 'the venue'}`
                                                            : "You are outside the check-in area")
                                                        : "Couldn't read your location"}
                                </span>
                            </motion.div>
                        </div>

                        {broadcastSession && !initialActiveLeave && (!geo.isWithinPerimeter || gpsWaitingTooLong) && !isCheckedIn && (
                            <div className="mb-3.5 flex flex-col gap-2 text-[11px] md:text-[12px] text-neutral-500 dark:text-white/50 leading-relaxed">
                                {!geo.isLoading && !geo.isWithinPerimeter && (
                                    <p>
                                        {geo.confirmationStatus === 'low_accuracy'
                                            ? 'You are near the venue, but GPS precision is low. Try stepping closer to a window or door, then tap Refresh.'
                                            : `You must be physically at ${geo.locationName || 'the venue'} to check in.`}
                                    </p>
                                )}
                                <div className="flex flex-wrap items-center gap-2.5">
                                    {!geo.isWithinPerimeter && (
                                        <button
                                            type="button"
                                            onClick={geo.retry}
                                            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-white/10 bg-neutral-100 dark:bg-white/5 px-2.5 py-1 text-xs font-semibold text-neutral-700 dark:text-white/70 transition-colors hover:bg-neutral-200 dark:hover:bg-white/10"
                                        >
                                            <RefreshCw className="h-3 w-3" />
                                            Refresh location
                                        </button>
                                    )}
                                    {hasActiveAssistance ? (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setAssistanceError(null);
                                                setIsAssistanceModalOpen(true);
                                            }}
                                            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400 transition-colors hover:bg-amber-500/20"
                                        >
                                            <Clock className="h-3 w-3 animate-pulse" />
                                            Active Request in Progress
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setAssistanceError(null);
                                                setIsAssistanceModalOpen(true);
                                            }}
                                            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-xs font-semibold text-blue-600 dark:text-blue-400 transition-colors hover:bg-blue-500/20"
                                        >
                                            <HelpCircle className="h-3 w-3" />
                                            Having trouble? Notify a leader
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        <AnimatePresence>
                            {(assistanceRequest || assistanceFeedback) && !assistanceBannerDismissed && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0, scale: 0.98 }}
                                    animate={{ opacity: 1, height: 'auto', scale: 1 }}
                                    exit={{ opacity: 0, height: 0, scale: 0.98 }}
                                    role="status"
                                    className="mb-4"
                                >
                                    {assistanceRequest?.status === 'resolved' ? (
                                        <div className="flex items-start justify-between gap-3 rounded-2xl border border-[#34A853]/35 bg-[#34A853]/10 p-3.5 text-[13px] text-neutral-800 dark:text-neutral-100 shadow-sm">
                                            <div className="flex items-start gap-2.5 min-w-0">
                                                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#34A853]" />
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-[#34A853]">Help Request Resolved</span>
                                                        <span className="rounded-full bg-[#34A853]/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#34A853]">
                                                            Leader Verified
                                                        </span>
                                                    </div>
                                                    {assistanceRequest.resolution_note ? (
                                                        <p className="mt-1 text-xs leading-relaxed text-neutral-700 dark:text-neutral-200">
                                                            <strong className="text-neutral-900 dark:text-white">Leader Note:</strong> &ldquo;{assistanceRequest.resolution_note}&rdquo;
                                                        </p>
                                                    ) : (
                                                        <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-300">
                                                            An event leader reviewed and resolved your check-in issue.
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setAssistanceBannerDismissed(true)}
                                                aria-label="Dismiss note"
                                                className="rounded-lg p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-white transition"
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    ) : assistanceRequest?.status === 'dismissed' ? (
                                        <div className="flex items-start justify-between gap-3 rounded-2xl border border-amber-500/35 bg-amber-500/10 p-3.5 text-[13px] text-neutral-800 dark:text-neutral-100 shadow-sm">
                                            <div className="flex items-start gap-2.5 min-w-0">
                                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-amber-600 dark:text-amber-400">Help Request Dismissed</span>
                                                    </div>
                                                    {assistanceRequest.resolution_note ? (
                                                        <p className="mt-1 text-xs leading-relaxed text-neutral-700 dark:text-neutral-200">
                                                            <strong className="text-neutral-900 dark:text-white">Leader Note:</strong> &ldquo;{assistanceRequest.resolution_note}&rdquo;
                                                        </p>
                                                    ) : (
                                                        <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-300">
                                                            Your check-in help request was reviewed and dismissed by a leader.
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setAssistanceBannerDismissed(true)}
                                                aria-label="Dismiss note"
                                                className="rounded-lg p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-white transition"
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    ) : assistanceRequest?.status === 'acknowledged' ? (
                                        <div className="flex items-start gap-2.5 rounded-2xl border border-blue-500/25 bg-blue-500/10 p-3.5 text-[13px] text-blue-700 dark:text-blue-300 shadow-sm">
                                            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-blue-600 dark:text-blue-400">Leader Reviewing Request</span>
                                                    <span className="inline-block h-2 w-2 rounded-full bg-blue-500 animate-ping" />
                                                </div>
                                                <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-300">
                                                    An event leader has acknowledged your request and is checking your location reading.
                                                </p>
                                                {assistanceRequest.resolution_note && (
                                                    <div className="mt-2 rounded-xl bg-blue-500/15 border border-blue-500/20 p-2.5">
                                                        <p className="text-xs leading-relaxed text-blue-900 dark:text-blue-100">
                                                            <strong className="text-blue-700 dark:text-blue-300 font-bold uppercase tracking-wider text-[10px] block mb-0.5">Leader Note:</strong> &ldquo;{assistanceRequest.resolution_note}&rdquo;
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-start gap-2.5 rounded-2xl border border-blue-500/20 bg-blue-500/10 p-3.5 text-[13px] text-blue-600 dark:text-blue-300">
                                            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <span className="font-semibold">Help Request Sent</span>
                                                <p className="mt-0.5 text-xs text-neutral-600 dark:text-white/70">
                                                    {assistanceFeedback || "Your check-in problem and GPS location were sent to event leaders. Waiting for verification."}
                                                </p>
                                                {assistanceRequest?.resolution_note && (
                                                    <div className="mt-2 rounded-xl bg-blue-500/15 border border-blue-500/20 p-2.5">
                                                        <p className="text-xs leading-relaxed text-blue-900 dark:text-blue-100">
                                                            <strong className="text-blue-700 dark:text-blue-300 font-bold uppercase tracking-wider text-[10px] block mb-0.5">Leader Note:</strong> &ldquo;{assistanceRequest.resolution_note}&rdquo;
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Server Action Error Banner */}
                        <AnimatePresence>
                            {(actionError || geo.error) && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="mb-4"
                                >
                                    <div className="bg-red-500/10 border border-red-500/20 text-red-500 dark:text-red-400 text-[13px] p-3 rounded-xl">
                                        {actionError || geo.error}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Action Center */}
                        <div className="flex justify-center md:justify-start py-2 md:py-4">
                            <div className="relative">
                                {/* Sleek organic water ripple animation (GPU-accelerated, lightweight) */}
                                {!isCheckedIn && !initialActiveLeave && geo.isWithinPerimeter && !geo.isLoading && (
                                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                                        <span className="water-ripple-1 absolute inset-0 rounded-full border border-[#34A853]/45 bg-[#34A853]/15" />
                                        <span className="water-ripple-2 absolute inset-0 rounded-full border border-[#34A853]/35 bg-[#34A853]/10" />
                                        <span className="water-ripple-3 absolute inset-0 rounded-full border border-[#34A853]/20 bg-[#34A853]/5" />
                                    </div>
                                )}

                                {isCheckedIn ? (
                                    /* Checked-in Session Status Display (non-interactive) */
                                    <motion.div
                                        role="status"
                                        aria-live="polite"
                                        initial={{ scale: 0.85 }}
                                        animate={{ scale: 1 }}
                                        transition={{ type: "spring", stiffness: 260, damping: 18 }}
                                        className="relative z-10 w-44 h-44 sm:w-52 sm:h-52 md:w-56 md:h-56 lg:w-60 lg:h-60 rounded-full flex flex-col items-center justify-center gap-1.5 transition-all duration-500 shadow-2xl bg-[#34A853]/10 border-2 border-[#34A853]/40 p-4"
                                    >
                                        {/* Success glow pulse behind the circle */}
                                        <div className="absolute inset-0 rounded-full bg-[#34A853]/15 animate-ping opacity-50 duration-[2000ms]" />
                                        <CheckCircle2 className="relative mb-1 h-10 w-10 sm:h-12 sm:w-12 stroke-[2.5] text-[#34A853]" aria-hidden="true" />
                                        <span className="relative text-[22px] sm:text-[25px] md:text-[27px] font-black tracking-tight text-[#34A853] leading-snug">
                                            Checked In
                                        </span>
                                        {broadcastSession && (
                                            <span className="relative max-w-[85%] truncate text-center text-[11px] sm:text-[12px] md:text-[13px] font-bold uppercase tracking-wider text-neutral-600 dark:text-white/70 mt-1 leading-snug" title={broadcastSession.title}>
                                                {broadcastSession.title}
                                            </span>
                                        )}
                                        {checkedInAt && (
                                            <motion.span
                                                initial={{ opacity: 0, y: 6 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: 0.4 }}
                                                className="relative mt-1 text-[10px] sm:text-[11px] md:text-[12px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-white/50 leading-snug"
                                            >
                                                Confirmed {formatTime12h(checkedInAt)}
                                            </motion.span>
                                        )}
                                    </motion.div>
                                ) : (
                                    /* Check In Button */
                                    <button
                                        onClick={handleCheckIn}
                                        disabled={isPending || !!initialActiveLeave || geo.isLoading || !geo.isWithinPerimeter || !broadcastSession}
                                        className={`relative z-10 w-44 h-44 sm:w-52 sm:h-52 md:w-56 md:h-56 lg:w-60 lg:h-60 rounded-full flex flex-col items-center justify-center gap-1.5 transition-all duration-500 shadow-2xl p-4
                                            ${!initialActiveLeave && geo.isWithinPerimeter && !geo.isLoading && broadcastSession
                                                ? "bg-[#34A853] hover:bg-[#2e9347] hover:scale-[1.03] active:scale-[0.98] text-white shadow-[#34A853]/30 ring-4 ring-[#34A853]/20"
                                                : "bg-neutral-200/50 dark:bg-white/5 border border-neutral-300 dark:border-white/10 text-neutral-400 dark:text-white/30 cursor-not-allowed"
                                            }
                                        `}
                                    >
                                        <motion.div
                                            initial={{ scale: 0.8, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            transition={{ duration: 0.2 }}
                                            className="flex flex-col items-center text-center px-2"
                                        >
                                            <span className="text-[22px] sm:text-[25px] md:text-[27px] font-black tracking-tight mb-2 leading-[1.2]">
                                                {initialActiveLeave
                                                    ? "On Leave"
                                                    : !geo.isLoading && !geo.isWithinPerimeter && broadcastSession
                                                    ? (geo.confirmationStatus === 'low_accuracy' ? "Check In" : "Outside Area")
                                                    : "Check In"}
                                            </span>
                                            <span className="text-[11px] sm:text-[12px] md:text-[13px] font-semibold opacity-85 tracking-wider uppercase text-center px-2 max-w-[210px] leading-relaxed">
                                                {initialActiveLeave
                                                    ? "Resume duty to enable"
                                                    : !broadcastSession
                                                    ? "Waiting for Broadcast..."
                                                    : geo.isLoading
                                                        ? "Locating..."
                                                        : geo.isWithinPerimeter
                                                            ? `Tap to mark attendance`
                                                            : geo.confirmationStatus === 'low_accuracy'
                                                                ? "Improve GPS accuracy"
                                                                : "Must be at venue"}
                                            </span>
                                        </motion.div>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Live Feed — COMMENTED OUT per team request
                    <div className="w-full lg:w-80 flex flex-col border-t lg:border-t-0 lg:border-l border-neutral-200 dark:border-white/10 pt-10 lg:pt-0 lg:pl-10 xl:pl-16">
                        <div className="flex items-center gap-2 mb-8">
                            <Users className="w-4 h-4 text-[#34A853]" />
                            <h3 className="text-[12px] font-bold text-neutral-700 dark:text-white/80 uppercase tracking-[0.2em]">Live Feed</h3>
                            <div className="ml-auto flex items-center gap-3">
                                <div className="w-1.5 h-1.5 rounded-full bg-[#34A853] animate-pulse"></div>
                            </div>
                        </div>

                        <div className="space-y-6">
                            {liveFeed.map((feed) => {
                                const init = `${feed.first_name[0]}${feed.last_name ? feed.last_name[0] : ''}`.toUpperCase();
                                return (
                                    <div key={feed.id} className="flex items-start gap-4 group">
                                        <div className="w-10 h-10 rounded-full bg-neutral-200/50 dark:bg-white/5 border border-neutral-300 dark:border-white/10 flex items-center justify-center text-xs font-bold text-neutral-600 dark:text-white/70 group-hover:bg-[#34A853]/10 group-hover:text-[#34A853] group-hover:border-[#34A853]/30 transition-colors shrink-0 relative overflow-hidden">
                                            {feed.avatar_url ? (
                                                <Image src={feed.avatar_url} alt={feed.first_name} fill unoptimized className="object-cover" sizes="40px" />
                                            ) : (
                                                init
                                            )}
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-baseline justify-between mb-0.5">
                                                <p className="text-[14px] font-medium text-neutral-800 dark:text-white/90">{feed.first_name} {feed.last_name}</p>
                                                <span className="text-[11px] text-[#34A853] font-medium">{formatTimeAgo(feed.created_at)}</span>
                                            </div>
                                            <p className="text-[12px] text-neutral-500 dark:text-white/40">{feed.department} • {feed.event_type}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    */}

                    </div>
                </div>

            </div>

            <AnimatePresence>
                {isAssistanceModalOpen && broadcastSession && (
                    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-4 overflow-hidden">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => {
                                if (!isSubmittingAssistance) setIsAssistanceModalOpen(false);
                            }}
                            className="fixed inset-0 bg-black/75 backdrop-blur-sm"
                        />
                        <motion.div
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="check-in-assistance-title"
                            initial={{ opacity: 0, scale: 0.96, y: 16 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.96, y: 16 }}
                            className="relative z-10 w-full max-w-md max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)] flex flex-col rounded-2xl sm:rounded-3xl border border-white/10 bg-[#111111] text-white shadow-2xl overflow-hidden my-auto"
                        >
                            {/* Header */}
                            <div className="flex items-start justify-between gap-3 p-4 sm:p-6 pb-3 sm:pb-4 border-b border-white/5 shrink-0">
                                <div className="flex items-start gap-3 min-w-0">
                                    <div className={`flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl shrink-0 mt-0.5 ${
                                        hasActiveAssistance
                                            ? "bg-amber-500/15 text-amber-400"
                                            : "bg-blue-500/15 text-blue-400"
                                    }`}>
                                        {hasActiveAssistance ? (
                                            <Clock className="h-4 w-4 sm:h-5 sm:w-5 animate-pulse" />
                                        ) : (
                                            <HelpCircle className="h-4 w-4 sm:h-5 sm:w-5" />
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <h2 id="check-in-assistance-title" className="text-base sm:text-lg font-bold tracking-tight text-white leading-tight">
                                            {hasActiveAssistance ? "Active Help Request" : "Notify an event leader"}
                                        </h2>
                                        <p className="mt-1 text-xs sm:text-sm leading-relaxed text-white/55">
                                            {hasActiveAssistance ? (
                                                <>You have an active, unresolved assistance report for <span className="text-white/80 font-medium">{broadcastSession.title}</span>.</>
                                            ) : (
                                                <>Report the location problem for <span className="text-white/80 font-medium">{broadcastSession.title}</span>. The leaders responsible for your department or team will be notified.</>
                                            )}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIsAssistanceModalOpen(false)}
                                    disabled={isSubmittingAssistance}
                                    aria-label="Close check-in assistance"
                                    className="rounded-full p-1.5 text-white/40 transition hover:bg-white/5 hover:text-white disabled:opacity-50 shrink-0 -mr-1"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>

                            {/* Scrollable Body */}
                            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 sm:space-y-4 overscroll-contain">
                                {hasActiveAssistance ? (
                                    <>
                                        <div className="rounded-xl sm:rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5 sm:p-4 text-xs sm:text-sm leading-relaxed text-amber-200/90">
                                            <div className="flex items-center gap-2 font-bold text-amber-400 mb-1">
                                                <Clock className="h-4 w-4 shrink-0 animate-pulse" />
                                                <span>Unattended Request in Progress</span>
                                            </div>
                                            <p>
                                                You already have an active request submitted for this event. Please wait for an event leader to review your report before sending another.
                                            </p>
                                        </div>

                                        <div className="rounded-xl sm:rounded-2xl border border-white/10 bg-white/5 p-3.5 sm:p-4 space-y-3">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-xs text-white/50">Current Status</span>
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                                                    assistanceRequest?.status === 'acknowledged'
                                                        ? "border border-blue-500/30 bg-blue-500/10 text-blue-400"
                                                        : "border border-amber-500/30 bg-amber-500/10 text-amber-400"
                                                }`}>
                                                    <span className={`h-1.5 w-1.5 rounded-full ${
                                                        assistanceRequest?.status === 'acknowledged'
                                                            ? "bg-blue-400 animate-ping"
                                                            : "bg-amber-400 animate-pulse"
                                                    }`} />
                                                    {assistanceRequest?.status === 'acknowledged' ? "Leader Reviewing" : "Waiting for Leader"}
                                                </span>
                                            </div>

                                            {assistanceRequest?.created_at && (
                                                <div className="flex items-center justify-between gap-2 text-xs text-white/50 border-t border-white/5 pt-2">
                                                    <span>Submitted at</span>
                                                    <span className="font-mono text-white/80">{formatTime12h(assistanceRequest.created_at)}</span>
                                                </div>
                                            )}

                                            {assistanceRequest?.worker_message && (
                                                <div className="border-t border-white/5 pt-2.5">
                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/40 block mb-1">Your Submitted Note</span>
                                                    <p className="text-xs text-white/80 italic leading-relaxed">
                                                        &ldquo;{assistanceRequest.worker_message.replace(/\[Coords:\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\]/, "").trim()}&rdquo;
                                                    </p>
                                                </div>
                                            )}

                                            {assistanceRequest?.resolution_note && (
                                                <div className="border-t border-white/5 pt-2.5">
                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400 block mb-1">Leader Note</span>
                                                    <p className="text-xs text-white/95 leading-relaxed bg-white/5 p-2 rounded-lg border border-white/10">
                                                        &ldquo;{assistanceRequest.resolution_note}&rdquo;
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex items-start sm:items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-white/70">
                                            <MapPin className="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5 sm:mt-0" />
                                            <span className="leading-relaxed">
                                                Your device GPS location coordinates were attached so leaders can verify your physical presence at the venue.
                                            </span>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="rounded-xl sm:rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3 sm:p-4 text-xs sm:text-sm leading-relaxed text-amber-200/80">
                                            This request does not check you in and does not override location confirmation. A leader must independently verify attendance before using the audited proxy check-in process.
                                        </div>

                                        <div className="flex items-start sm:items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-white/70">
                                            <MapPin className="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5 sm:mt-0" />
                                            <span className="leading-relaxed">
                                                {geo.lat !== null && geo.lng !== null
                                                    ? `Your device GPS coordinates (${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)}) will be attached for leader verification.`
                                                    : geo.isLoading
                                                        ? "Detecting your GPS location to attach for leader verification…"
                                                        : "Your current location status will be sent to event leaders."}
                                            </span>
                                        </div>

                                        <div>
                                            <label className="block text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-white/50" htmlFor="check-in-assistance-message">
                                                What happened? <span className="normal-case tracking-normal text-white/30">(optional)</span>
                                            </label>
                                            <textarea
                                                id="check-in-assistance-message"
                                                value={assistanceMessage}
                                                onChange={(event) => setAssistanceMessage(event.target.value)}
                                                maxLength={500}
                                                rows={3}
                                                placeholder="For example: I am at the venue entrance but my phone is still locating me."
                                                className="mt-1.5 w-full resize-none rounded-xl sm:rounded-2xl border border-white/10 bg-white/5 p-3 text-xs sm:text-sm text-white outline-none transition placeholder:text-white/25 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/15"
                                            />
                                            <p className="mt-1 text-right text-[10px] sm:text-[11px] text-white/30">{assistanceMessage.length}/500</p>
                                        </div>

                                        {assistanceError && (
                                            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs sm:text-sm text-red-300">
                                                {assistanceError}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            {/* Actions / Footer */}
                            <div className="p-3.5 sm:p-5 border-t border-white/5 bg-[#111111] shrink-0">
                                {hasActiveAssistance ? (
                                    <button
                                        type="button"
                                        onClick={() => setIsAssistanceModalOpen(false)}
                                        className="w-full rounded-xl bg-white/10 hover:bg-white/15 px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-bold text-white transition text-center border border-white/10"
                                    >
                                        Got it, I&apos;ll wait
                                    </button>
                                ) : (
                                    <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setIsAssistanceModalOpen(false)}
                                            disabled={isSubmittingAssistance}
                                            className="rounded-xl border border-white/10 px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-bold text-white/70 transition hover:bg-white/5 disabled:opacity-50 text-center"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleRequestAssistance}
                                            disabled={isSubmittingAssistance}
                                            className="inline-flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl bg-blue-500 px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-bold text-white transition hover:bg-blue-400 disabled:opacity-50 text-center shadow-lg shadow-blue-500/20"
                                        >
                                            {isSubmittingAssistance ? (
                                                <>
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                    <span className="truncate">Sending report...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Send className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                                    <span className="truncate">Notify Leader</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {isReturnModalOpen && initialActiveLeave && (
                    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-4 overflow-hidden">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => {
                                if (!isSubmittingReturn) setIsReturnModalOpen(false);
                            }}
                            className="fixed inset-0 bg-black/75 backdrop-blur-sm"
                        />
                        <motion.div
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="early-return-title"
                            initial={{ opacity: 0, scale: 0.96, y: 16 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.96, y: 16 }}
                            className="relative z-10 w-full max-w-md max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)] flex flex-col rounded-2xl sm:rounded-3xl border border-white/10 bg-[#111111] text-white shadow-2xl overflow-hidden my-auto"
                        >
                            {/* Header */}
                            <div className="flex items-start justify-between gap-3 p-4 sm:p-6 pb-3 sm:pb-4 border-b border-white/5 shrink-0">
                                <div className="flex items-start gap-3 min-w-0">
                                    <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400 shrink-0 mt-0.5">
                                        <RotateCcw className="h-4 w-4 sm:h-5 sm:w-5" />
                                    </div>
                                    <div className="min-w-0">
                                        <h2 id="early-return-title" className="text-base sm:text-lg font-bold tracking-tight text-white leading-tight">Resume duty early?</h2>
                                        <p className="mt-1 text-xs sm:text-sm leading-relaxed text-white/55">
                                            Your approved leave currently runs through <span className="text-white/80 font-medium">{initialActiveLeave.endDate}</span>. Resuming takes effect immediately and restores check-in access.
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIsReturnModalOpen(false)}
                                    disabled={isSubmittingReturn}
                                    aria-label="Close early return confirmation"
                                    className="rounded-full p-1.5 text-white/40 transition hover:bg-white/5 hover:text-white disabled:opacity-50 shrink-0 -mr-1"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>

                            {/* Scrollable Body */}
                            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 sm:space-y-4 overscroll-contain">
                                <div className="rounded-xl sm:rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3 sm:p-4 text-xs sm:text-sm leading-relaxed text-amber-200/80">
                                    This action is recorded for your administrators and cannot be undone from the worker dashboard.
                                </div>

                                <div>
                                    <label className="block text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-white/50" htmlFor="early-return-note">
                                        Optional return note
                                    </label>
                                    <textarea
                                        id="early-return-note"
                                        value={returnNote}
                                        onChange={(event) => setReturnNote(event.target.value)}
                                        maxLength={500}
                                        rows={3}
                                        placeholder="For example: I returned earlier than planned."
                                        className="mt-1.5 w-full resize-none rounded-xl sm:rounded-2xl border border-white/10 bg-white/5 p-3 text-xs sm:text-sm text-white outline-none transition placeholder:text-white/25 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/15"
                                    />
                                    <p className="mt-1 text-right text-[10px] sm:text-[11px] text-white/30">{returnNote.length}/500</p>
                                </div>

                                {returnError && (
                                    <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs sm:text-sm text-red-300">
                                        {returnError}
                                    </div>
                                )}
                            </div>

                            {/* Actions / Footer */}
                            <div className="p-3.5 sm:p-5 border-t border-white/5 bg-[#111111] shrink-0 grid grid-cols-2 gap-2.5 sm:gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsReturnModalOpen(false)}
                                    disabled={isSubmittingReturn}
                                    className="rounded-xl border border-white/10 px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-bold text-white/70 transition hover:bg-white/5 disabled:opacity-50 text-center"
                                >
                                    Keep Leave
                                </button>
                                <button
                                    type="button"
                                    onClick={handleEndLeaveEarly}
                                    disabled={isSubmittingReturn}
                                    className="inline-flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl bg-amber-500 px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-bold text-black transition hover:bg-amber-400 disabled:opacity-50 text-center shadow-lg shadow-amber-500/20"
                                >
                                    {isSubmittingReturn ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            <span className="truncate">Resuming duty...</span>
                                        </>
                                    ) : (
                                        <>
                                            <RotateCcw className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                            <span className="truncate">Resume Now</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Leave Request Modal */}
            <LeaveRequestModal isOpen={isLeaveModalOpen} onClose={() => setIsLeaveModalOpen(false)} />
            <BirthdayPrompt initialOpen={shouldPromptForBirthday} />
        </main>
    );
}
