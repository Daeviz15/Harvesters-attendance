"use client";

import { useState, useEffect, useTransition, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { 
    MapPin, WifiOff, Clock, Calendar, CheckCircle2, 
    CircleDashed, LogOut, Menu, X, Users, CalendarDays,
    AlertTriangle, Loader2, History
} from "lucide-react";
import LeaveRequestModal from "@/components/LeaveRequestModal";
import LoadingOverlay from "@/components/LoadingOverlay";
import { logout } from "@/app/auth/actions";
import { verifyAndCheckIn, autoCheckout, fetchAttendanceHistory } from "./actions";
import { useGeolocation } from "@/hooks/useGeolocation";
import ThemeToggle from "@/components/ThemeToggle";
import type { AttendanceLog, LiveFeedEvent } from "@/lib/types";
import { createClient } from "@/utils/supabase/client";

/** Formats an ISO timestamp into relative time (e.g., "Just now", "5 mins ago") */
function formatTimeAgo(isoString: string): string {
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} mins ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hours ago`;
    return `${Math.floor(diffHours / 24)} days ago`;
}

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
    fullName: string;
    initials: string;
    department: string;
    history: AttendanceLog[];
    hasMore: boolean;
    isLoadingMore: boolean;
    onLoadMore: () => void;
}

const SidebarContent = ({ setIsMobileMenuOpen, setIsLeaveModalOpen, fullName, initials, department, history, hasMore, isLoadingMore, onLoadMore }: SidebarContentProps) => (
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

        <div className="flex items-center gap-4 p-4 rounded-2xl bg-neutral-200/50 dark:bg-white/5 border border-neutral-300 dark:border-white/10 mb-10">
            <div className="w-12 h-12 rounded-full bg-[#34A853]/20 border border-[#34A853]/30 flex items-center justify-center text-lg font-bold text-[#34A853]">
                {initials}
            </div>
            <div>
                <p className="text-[15px] font-semibold text-neutral-800 dark:text-white/90">{fullName}</p>
                <p className="text-[12px] text-[#34A853] tracking-widest uppercase font-medium">{department}</p>
            </div>
        </div>

        <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-[11px] font-semibold text-neutral-500 dark:text-white/50 uppercase tracking-[0.2em]">Your History</h3>
            </div>
            
            <div className="space-y-4 overflow-y-auto pr-2 no-scrollbar flex-1">
                {history.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 gap-3">
                        <History className="w-8 h-8 text-neutral-300 dark:text-white/15" />
                        <p className="text-[13px] text-neutral-400 dark:text-white/30 text-center">No attendance records yet.<br/>Check in to get started.</p>
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
    firstName: string;
    fullName: string;
    initials: string;
    department: string;
    initialIsCheckedIn: boolean;
    checkInTime: string | null;
    serverTime: string;
    initialHistory: AttendanceLog[];
    initialHasMore: boolean;
    initialLiveFeed: LiveFeedEvent[];
}

const GRACE_PERIOD_SECONDS = 180; // 3 minutes

export default function DashboardClient({ userId, firstName, fullName, initials, department, initialIsCheckedIn, checkInTime, serverTime, initialHistory, initialHasMore, initialLiveFeed }: DashboardClientProps) {
    const geo = useGeolocation();
    const [isPending, startTransition] = useTransition();

    const [isCheckedIn, setIsCheckedIn] = useState(initialIsCheckedIn);
    const [actionError, setActionError] = useState<string | null>(null);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
    
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [gracePeriodRemaining, setGracePeriodRemaining] = useState<number | null>(null);

    // Attendance history state (cursor-based pagination)
    const [history, setHistory] = useState<AttendanceLog[]>(initialHistory);
    const [hasMore, setHasMore] = useState(initialHasMore);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    // Live feed state
    const [liveFeed, setLiveFeed] = useState<LiveFeedEvent[]>(initialLiveFeed);

    // Refs for timer logic to avoid constant interval recreation
    const geoRef = useRef(geo);
    const timeWentOutsideRef = useRef<number | null>(null);
    const isCheckedInRef = useRef(isCheckedIn);

    // Keep refs synced with state
    useEffect(() => { geoRef.current = geo; }, [geo]);
    useEffect(() => { isCheckedInRef.current = isCheckedIn; }, [isCheckedIn]);

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
            // Listen to global live feed events
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'live_feed_events'
            }, (payload) => {
                const newEvent = payload.new as LiveFeedEvent;
                setLiveFeed(prev => [newEvent, ...prev].slice(0, 50)); // Keep max 50 items in memory
            })
            // Listen to personal attendance logs (cross-device sync)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'attendance_logs',
                filter: `user_id=eq.${userId}`
            }, (payload) => {
                if (payload.eventType === 'INSERT') {
                    if (payload.new.status === 'active') setIsCheckedIn(true);
                } else if (payload.eventType === 'UPDATE') {
                    if (payload.new.status !== 'active') {
                        setIsCheckedIn(false);
                        setGracePeriodRemaining(null);
                    }
                }
                refreshHistory();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [userId, refreshHistory]);

    // Simulated Timer for active shift (with client-server clock drift correction)
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isCheckedIn && checkInTime) {
            const clientNow = Date.now();
            const serverStart = new Date(serverTime).getTime();
            const drift = clientNow - serverStart;
            
            const start = new Date(checkInTime).getTime();
            
            const getElapsed = () => {
                const adjustedNow = Date.now() - drift;
                return Math.max(0, Math.floor((adjustedNow - start) / 1000));
            };

            setElapsedSeconds(getElapsed());

            interval = setInterval(() => {
                setElapsedSeconds(getElapsed());
            }, 1000);
        } else {
            setElapsedSeconds(0);
        }
        return () => clearInterval(interval);
    }, [isCheckedIn, checkInTime, serverTime]);

    // Robust Grace Period Timer Logic (Jitter Buffer Layer)
    useEffect(() => {
        const JITTER_BUFFER_SECONDS = 15; // Must be consistently outside for 15s to trigger warning
        
        const interval = setInterval(() => {
            const currentGeo = geoRef.current;
            
            if (!isCheckedInRef.current) {
                timeWentOutsideRef.current = null;
                setGracePeriodRemaining(null);
                return;
            }

            // Ignore readings while loading, or if the accuracy is horribly bad (GPS jitter)
            if (currentGeo.isLoading || currentGeo.lat === null || (currentGeo.accuracy && currentGeo.accuracy > 150)) {
                return; // Skip evaluation this tick
            }

            if (!currentGeo.isWithinPerimeter) {
                if (timeWentOutsideRef.current === null) {
                    // Start the jitter buffer clock
                    timeWentOutsideRef.current = Date.now();
                } else {
                    const secondsOutside = Math.floor((Date.now() - timeWentOutsideRef.current) / 1000);
                    
                    if (secondsOutside >= JITTER_BUFFER_SECONDS) {
                        // They have breached the jitter buffer. Start the grace period.
                        const graceRemaining = GRACE_PERIOD_SECONDS - (secondsOutside - JITTER_BUFFER_SECONDS);
                        
                        if (graceRemaining > 0) {
                            setGracePeriodRemaining(graceRemaining);
                        } else {
                            // Time's up!
                            setGracePeriodRemaining(0);
                            timeWentOutsideRef.current = null;
                            handleAutoCheckout();
                        }
                    }
                }
            } else {
                // They came back inside! Cancel everything.
                timeWentOutsideRef.current = null;
                setGracePeriodRemaining(null);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, []); // Empty dependency array, relies on refs

    const formatTime = (totalSeconds: number) => {
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        if (h > 0) return `${h}h ${m}m ${s}s`;
        return `${m}m ${s}s`;
    };

    const handleCheckIn = () => {
        setActionError(null);

        if (geo.isLoading) {
            setActionError("Waiting for GPS coordinates to check in...");
            return;
        }
        if (geo.lat === null || geo.lng === null) {
            setActionError("GPS coordinates are required to check in.");
            return;
        }

        const formData = new FormData();
        formData.append("lat", geo.lat.toString());
        formData.append("lng", geo.lng.toString());

        startTransition(async () => {
            const res = await verifyAndCheckIn(formData);
            if (res.error) {
                setActionError(res.error);
            } else {
                setIsCheckedIn(true);
                refreshHistory();
            }
        });
    };

    const handleAutoCheckout = () => {
        const formData = new FormData();
        if (geo.lat !== null && geo.lng !== null) {
            formData.append("lat", geo.lat.toString());
            formData.append("lng", geo.lng.toString());
        }
        
        startTransition(async () => {
            const res = await autoCheckout(formData);
            if (!res.error) {
                setIsCheckedIn(false);
                setGracePeriodRemaining(null);
                refreshHistory();
            } else {
                console.error("Auto checkout failed:", res.error);
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
            <LoadingOverlay isOpen={isPending} />
            
            {/* Ambient Background Glow */}
            <div className="absolute inset-0 pointer-events-none opacity-20 z-0">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/10 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-[150px]"></div>
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-[#34A853]/5 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-[150px]"></div>
            </div>

            {/* Desktop Sidebar */}
            <aside className="hidden md:flex w-80 h-screen border-r border-neutral-200 dark:border-white/10 bg-neutral-100/40 dark:bg-black/40 backdrop-blur-xl p-8 flex-col relative z-20">
                <SidebarContent setIsMobileMenuOpen={setIsMobileMenuOpen} setIsLeaveModalOpen={setIsLeaveModalOpen} fullName={fullName} initials={initials} department={department} history={history} hasMore={hasMore} isLoadingMore={isLoadingMore} onLoadMore={handleLoadMore} />
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
                            <SidebarContent setIsMobileMenuOpen={setIsMobileMenuOpen} setIsLeaveModalOpen={setIsLeaveModalOpen} fullName={fullName} initials={initials} department={department} history={history} hasMore={hasMore} isLoadingMore={isLoadingMore} onLoadMore={handleLoadMore} />
                        </motion.aside>
                    </>
                )}
            </AnimatePresence>

            {/* Main Content */}
            <div className="flex-1 flex flex-col h-screen overflow-y-auto overflow-x-hidden relative z-10 scroll-smooth no-scrollbar">
                
                {/* Grace Period Warning Banner */}
                <AnimatePresence>
                    {gracePeriodRemaining !== null && (
                        <motion.div 
                            initial={{ y: -50, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: -50, opacity: 0 }}
                            className="w-full bg-orange-500/10 border-b border-orange-500/20 py-2.5 px-6 flex items-center justify-center gap-2 sticky top-0 z-30 backdrop-blur-md"
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
                <div className="md:hidden flex items-center justify-between p-6">
                    <button 
                        onClick={() => setIsMobileMenuOpen(true)}
                        className="p-2 -ml-2 text-neutral-600 hover:text-neutral-900 dark:text-white/70 dark:hover:text-white"
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
                            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-neutral-800 dark:text-white/90 mb-2">{getGreeting()}, {firstName}.</h1>
                            <p className="text-[15px] text-neutral-500 dark:text-white/50">Ready to serve today? Mark your attendance below.</p>
                        </div>

                        {/* Status Pill */}
                        <div className="flex justify-start mb-6">
                            <motion.div 
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border backdrop-blur-md transition-colors ${
                                    geo.isLoading
                                        ? "bg-neutral-200/50 dark:bg-white/5 border-neutral-300 dark:border-white/10 text-neutral-500 dark:text-white/50"
                                        : geo.isWithinPerimeter 
                                            ? "bg-[#34A853]/10 border-[#34A853]/20 text-[#34A853]" 
                                            : "bg-red-500/10 border-red-500/20 text-red-500 dark:text-red-400"
                                }`}
                            >
                                <MapPin className="w-3.5 h-3.5" />
                                <span className="text-[12px] font-medium tracking-wide">
                                    {geo.isLoading ? "Acquiring GPS Signal..." : geo.isWithinPerimeter ? "Detected at Ologolo, Lekki" : "Outside Perimeter"}
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
                                {!isCheckedIn && geo.isWithinPerimeter && !geo.isLoading && (
                                    <div className="absolute inset-0 bg-[#34A853]/20 rounded-full animate-ping opacity-75 duration-1000"></div>
                                )}
                                
                                {isCheckedIn ? (
                                    /* Active Session Status Display (non-interactive) */
                                    <div
                                        className="relative w-56 h-56 sm:w-64 sm:h-64 md:w-72 md:h-72 rounded-full flex flex-col items-center justify-center gap-2 transition-all duration-500 shadow-2xl bg-[#34A853]/10 border-2 border-[#34A853]/30"
                                    >
                                        <div className="w-3 h-3 rounded-full bg-[#34A853] animate-pulse mb-2"></div>
                                        <span className="text-[28px] md:text-[34px] font-bold tracking-tight text-[#34A853]">
                                            Active
                                        </span>
                                        <div className="flex items-center gap-2 text-neutral-600 dark:text-white/60 mt-1">
                                            <Clock className="w-4 h-4" />
                                            <span className="text-base md:text-lg font-mono tracking-wider">{formatTime(elapsedSeconds)}</span>
                                        </div>
                                        <span className="text-[11px] text-neutral-500 dark:text-white/35 tracking-wider uppercase mt-2">
                                            Auto-checkout on exit
                                        </span>
                                    </div>
                                ) : (
                                    /* Check In Button */
                                    <button
                                        onClick={handleCheckIn}
                                        disabled={isPending || geo.isLoading || !geo.isWithinPerimeter}
                                        className={`relative w-56 h-56 sm:w-64 sm:h-64 md:w-72 md:h-72 rounded-full flex flex-col items-center justify-center gap-2 transition-all duration-500 shadow-2xl
                                            ${geo.isWithinPerimeter && !geo.isLoading
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
                                                Check In
                                            </span>
                                            <span className="text-[14px] font-medium opacity-80 tracking-wider uppercase mt-2 text-center px-4">
                                                {geo.isLoading 
                                                    ? "Locating..." 
                                                    : geo.isWithinPerimeter 
                                                        ? "Tap to record" 
                                                        : `Distance: ${Math.round(geo.distance || 0)}m`}
                                            </span>
                                        </motion.div>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Live Feed */}
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
                                    <div className="w-10 h-10 rounded-full bg-neutral-200/50 dark:bg-white/5 border border-neutral-300 dark:border-white/10 flex items-center justify-center text-xs font-bold text-neutral-600 dark:text-white/70 group-hover:bg-[#34A853]/10 group-hover:text-[#34A853] group-hover:border-[#34A853]/30 transition-colors">
                                        {init}
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

                </div>

            </div>

            {/* Leave Request Modal */}
            <LeaveRequestModal isOpen={isLeaveModalOpen} onClose={() => setIsLeaveModalOpen(false)} />
        </main>
    );
}
