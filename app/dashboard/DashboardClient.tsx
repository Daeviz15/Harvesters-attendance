"use client";

import { useState, useEffect, useTransition, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    MapPin, Calendar, CheckCircle2,
    CircleDashed, LogOut, Menu, X, CalendarDays,
    AlertTriangle, Loader2, History, Crown, CalendarX2, RotateCcw
} from "lucide-react";
import LeaveRequestModal from "@/components/LeaveRequestModal";
import LoadingOverlay from "@/components/LoadingOverlay";
import { logout } from "@/app/auth/actions";
import { verifyAndCheckIn, fetchAttendanceHistory, checkSessionAlive, endMyLeaveEarly } from "./actions";
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

            <div className="space-y-4 overflow-y-auto pr-2 no-scrollbar flex-1">
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
    initialBroadcastSession: { id: string, title: string } | null;
    upcomingEvent: UpcomingEvent | null;
    serverNow: string;
    activeLocations: { id: string, name: string, latitude: number, longitude: number, radius: number }[];
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
}

export default function DashboardClient({
    userId, username, workerId, initials, department, team, avatarUrl,
    initialIsCheckedIn, initialCheckedInAt,
    initialHistory, initialHasMore, /* initialLiveFeed, */ initialBroadcastSession,
    upcomingEvent, serverNow,
    activeLocations, headDepartmentName, shouldPromptForBirthday, canAccessAdmin,
    initialActiveLeave, upcomingBirthdays
}: DashboardClientProps) {
    const router = useRouter();
    // Avoid collecting location while an approved leave makes check-in unavailable.
    const geo = useGeolocation(activeLocations, !initialActiveLeave);
    const [isPending, startTransition] = useTransition();

    const [isCheckedIn, setIsCheckedIn] = useState(initialIsCheckedIn);
    const [checkedInAt, setCheckedInAt] = useState<string | null>(initialCheckedInAt);
    const [broadcastSession, setBroadcastSession] = useState<{ id: string, title: string } | null>(initialBroadcastSession);

    const [actionError, setActionError] = useState<string | null>(null);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
    const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
    const [returnNote, setReturnNote] = useState("");
    const [returnError, setReturnError] = useState<string | null>(null);
    const [pendingAction, setPendingAction] = useState<"check-in" | "return" | null>(null);
    const [gracePeriodRemaining] = useState<number | null>(null);

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

        const formData = new FormData();
        formData.append("sessionId", broadcastSession.id);
        formData.append("lat", geo.lat.toString());
        formData.append("lng", geo.lng.toString());
        if (geo.accuracy !== null) {
            formData.append("accuracy", geo.accuracy.toString());
        }

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

    const handleEndLeaveEarly = () => {
        if (!initialActiveLeave || isPending) return;

        setReturnError(null);
        const formData = new FormData();
        formData.set("leaveRequestId", initialActiveLeave.id);
        formData.set("returnNote", returnNote);

        setPendingAction("return");
        startTransition(async () => {
            try {
                const result = await endMyLeaveEarly(formData);
                if (result.error) {
                    setReturnError(result.error);
                    return;
                }

                setIsReturnModalOpen(false);
                setReturnNote("");
                router.refresh();
            } finally {
                setPendingAction(null);
            }
        });
    };

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return "Good Morning";
        if (hour < 18) return "Good Afternoon";
        return "Good Evening";
    };

    return (
        <main className="min-h-screen w-full bg-background text-foreground relative overflow-hidden font-sans flex transition-colors duration-300">
            <LoadingOverlay
                isOpen={isPending}
                text={pendingAction === "return" ? "Resuming duty..." : "Checking in..."}
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
            <div className="relative z-10 flex h-screen flex-1 flex-col overflow-y-auto overflow-x-hidden pt-20 scroll-smooth no-scrollbar md:pt-0">

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
                                You left the perimeter! Auto-checkout in <span className="font-bold">{formatTime(gracePeriodRemaining)}</span>.
                            </span>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Desktop Header */}
                <div className="hidden md:flex items-center justify-end px-12 pt-8 pb-4 relative z-20">
                    <ThemeToggle />
                </div>

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

                <div className="flex-1 w-full max-w-4xl mx-auto px-6 md:px-12 pt-4 md:pt-16 pb-12 flex flex-col lg:flex-row gap-16 lg:gap-12 xl:gap-24">

                    {/* Left Column: Action & Welcome */}
                    <div className="flex-1 flex flex-col">
                        <div className="mb-12">
                            <h1 className="text-[28px] md:text-[34px] font-bold tracking-tight text-neutral-800 dark:text-white/90 mb-2 leading-tight flex flex-wrap items-baseline gap-x-2">
                                <span suppressHydrationWarning>{getGreeting()}, {username}</span>
                                {workerId && (
                                    <span className="text-xs md:text-sm font-mono font-normal text-neutral-500 dark:text-white/60 bg-neutral-200/60 dark:bg-white/10 px-2 py-0.5 rounded-md align-middle">
                                        {workerId}
                                    </span>
                                )}
                                <span>!</span>
                            </h1>
                            <p className="text-[15px] text-neutral-500 dark:text-white/50">Ready to serve today? Mark your attendance below.</p>
                        </div>

                        {initialActiveLeave && (
                            <div className="mb-8 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-5">
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
                                            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-black transition hover:bg-amber-400"
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
                            <div className="mb-4 max-w-xl rounded-2xl border border-[#34A853]/20 bg-[#34A853]/5 px-5 py-4">
                                <div className="flex items-start gap-3">
                                    <div className="rounded-xl bg-[#34A853]/10 p-2 text-[#34A853]">
                                        <CalendarDays className="h-5 w-5" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#34A853]">
                                            Active event
                                        </p>
                                        <p className="mt-1 text-lg font-bold text-neutral-900 dark:text-white">
                                            {broadcastSession.title}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Status Pill */}
                        <div className="flex justify-start mb-6">
                            <motion.div
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border backdrop-blur-md transition-colors ${initialActiveLeave
                                    ? "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                    : geo.isLoading
                                        ? "bg-neutral-200/50 dark:bg-white/5 border-neutral-300 dark:border-white/10 text-neutral-500 dark:text-white/50"
                                        : geo.isWithinPerimeter
                                            ? "bg-[#34A853]/10 border-[#34A853]/20 text-[#34A853]"
                                            : "bg-red-500/10 border-red-500/20 text-red-500 dark:text-red-400"
                                    }`}
                            >
                                <MapPin className="w-3.5 h-3.5" />
                                <span className="text-[12px] font-medium tracking-wide">
                                    {initialActiveLeave
                                        ? "Location paused while on leave"
                                        : geo.isLoading
                                            ? "Acquiring GPS Signal..."
                                            : geo.isWithinPerimeter
                                                ? `Detected at ${geo.locationName}`
                                                : "Outside Perimeter"}
                                </span>
                            </motion.div>
                        </div>

                        {/* Server Action Error Banner */}
                        <AnimatePresence>
                            {(actionError || geo.error) && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="mb-8"
                                >
                                    <div className="bg-red-500/10 border border-red-500/20 text-red-500 dark:text-red-400 text-[13px] p-4 rounded-xl">
                                        {actionError || geo.error}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Action Center */}
                        <div className="flex justify-center lg:justify-start py-8">
                            <div className="relative">
                                {/* Outer pulsating ring for Check In state */}
                                {!isCheckedIn && !initialActiveLeave && geo.isWithinPerimeter && !geo.isLoading && (
                                    <div className="absolute inset-0 bg-[#34A853]/20 rounded-full animate-ping opacity-75 duration-1000"></div>
                                )}

                                {isCheckedIn ? (
                                    /* Checked-in Session Status Display (non-interactive) */
                                    <div
                                        role="status"
                                        aria-live="polite"
                                        className="relative w-56 h-56 sm:w-64 sm:h-64 md:w-72 md:h-72 rounded-full flex flex-col items-center justify-center gap-2 transition-all duration-500 shadow-2xl bg-[#34A853]/10 border-2 border-[#34A853]/40"
                                    >
                                        <CheckCircle2 className="mb-1 h-14 w-14 stroke-[2.75] text-[#34A853]" aria-hidden="true" />
                                        <span className="text-[30px] md:text-[38px] font-black tracking-tight text-[#34A853]">
                                            Checked In
                                        </span>
                                        {broadcastSession && (
                                            <span className="max-w-[85%] truncate text-center text-[12px] font-bold uppercase tracking-wider text-neutral-600 dark:text-white/60" title={broadcastSession.title}>
                                                {broadcastSession.title}
                                            </span>
                                        )}
                                        {checkedInAt && (
                                            <span className="mt-1 text-[11px] font-medium uppercase tracking-wider text-neutral-500 dark:text-white/40">
                                                Confirmed at {formatTime12h(checkedInAt)}
                                            </span>
                                        )}
                                    </div>
                                ) : (
                                    /* Check In Button */
                                    <button
                                        onClick={handleCheckIn}
                                        disabled={isPending || !!initialActiveLeave || geo.isLoading || !geo.isWithinPerimeter || !broadcastSession}
                                        className={`relative w-56 h-56 sm:w-64 sm:h-64 md:w-72 md:h-72 rounded-full flex flex-col items-center justify-center gap-2 transition-all duration-500 shadow-2xl
                                            ${!initialActiveLeave && geo.isWithinPerimeter && !geo.isLoading && broadcastSession
                                                ? "bg-[#34A853] hover:bg-[#2e9347] text-white shadow-[#34A853]/20"
                                                : "bg-neutral-200/50 dark:bg-white/5 border border-neutral-300 dark:border-white/10 text-neutral-400 dark:text-white/30 cursor-not-allowed"
                                            }
                                        `}
                                    >
                                        <motion.div
                                            initial={{ scale: 0.8, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            transition={{ duration: 0.2 }}
                                            className="flex flex-col items-center"
                                        >
                                            <span className="text-[32px] md:text-[40px] font-bold tracking-tight mb-1">
                                                {initialActiveLeave ? "On Leave" : "Check In"}
                                            </span>
                                            <span className="text-[14px] font-medium opacity-80 tracking-wider uppercase mt-2 text-center px-4">
                                                {initialActiveLeave
                                                    ? "Resume duty to enable check-in"
                                                    : !broadcastSession
                                                    ? "Waiting for Broadcast..."
                                                    : geo.isLoading
                                                        ? "Locating..."
                                                        : geo.isWithinPerimeter
                                                            ? `Tap to join ${broadcastSession.title}`
                                                            : `Distance: ${Math.round(geo.distance || 0)}m`}
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

            <AnimatePresence>
                {isReturnModalOpen && initialActiveLeave && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => {
                                if (!isPending) setIsReturnModalOpen(false);
                            }}
                            className="fixed inset-0 z-[80] bg-black/75 backdrop-blur-sm"
                        />
                        <motion.div
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="early-return-title"
                            initial={{ opacity: 0, scale: 0.96, y: 16 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.96, y: 16 }}
                            className="fixed left-1/2 top-1/2 z-[90] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-white/10 bg-[#111111] p-6 text-white shadow-2xl"
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <h2 id="early-return-title" className="text-xl font-bold">Resume duty early?</h2>
                                    <p className="mt-2 text-sm leading-6 text-white/55">
                                        Your approved leave currently runs through {initialActiveLeave.endDate}. Resuming takes effect immediately and restores check-in access.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIsReturnModalOpen(false)}
                                    disabled={isPending}
                                    aria-label="Close early return confirmation"
                                    className="rounded-full p-2 text-white/40 transition hover:bg-white/5 hover:text-white disabled:opacity-50"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>

                            <div className="mt-5 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm leading-6 text-amber-200/80">
                                This action is recorded for your administrators and cannot be undone from the worker dashboard.
                            </div>

                            <label className="mt-5 block text-xs font-semibold uppercase tracking-wider text-white/50" htmlFor="early-return-note">
                                Optional return note
                            </label>
                            <textarea
                                id="early-return-note"
                                value={returnNote}
                                onChange={(event) => setReturnNote(event.target.value)}
                                maxLength={500}
                                rows={3}
                                placeholder="For example: I returned earlier than planned."
                                className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/15"
                            />

                            {returnError && (
                                <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
                                    {returnError}
                                </div>
                            )}

                            <div className="mt-6 grid grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsReturnModalOpen(false)}
                                    disabled={isPending}
                                    className="rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-white/70 transition hover:bg-white/5 disabled:opacity-50"
                                >
                                    Keep Leave
                                </button>
                                <button
                                    type="button"
                                    onClick={handleEndLeaveEarly}
                                    disabled={isPending}
                                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-black transition hover:bg-amber-400 disabled:opacity-50"
                                >
                                    {isPending && pendingAction === "return" ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <RotateCcw className="h-4 w-4" />
                                    )}
                                    Resume Now
                                </button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* Leave Request Modal */}
            <LeaveRequestModal isOpen={isLeaveModalOpen} onClose={() => setIsLeaveModalOpen(false)} />
            <BirthdayPrompt initialOpen={shouldPromptForBirthday} />
        </main>
    );
}
