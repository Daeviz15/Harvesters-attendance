"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { Activity, Calendar, Play, Square, Clock, Loader2, AlertTriangle, X, UserPlus, UserCheck, Search, User, Check } from "lucide-react";
import { beginSession, endSession, searchWorkersForCheckIn, manualWorkerCheckIn } from "./actions";
import { createClient } from "@/utils/supabase/client";

type EventType = {
    id: string;
    title: string;
    description: string | null;
    recurrence_day: string | null;
    recurrence_month: number | null;
    recurrence_month_day: number | null;
    schedule_frequency: "once" | "daily" | "weekly" | "monthly" | "yearly" | null;
    start_date: string | null;
    start_time: string | null;
    end_time: string | null;
};

type ActiveSessionType = {
    id: string;
    event_id: string;
    start_time: string;
    scheduled_start_at: string | null;
    scheduled_end_at: string | null;
    started_by_mode: "manual" | "auto" | null;
    ended_by_mode: "manual" | "auto" | null;
    event: { title: string };
};

const frequencyLabels = {
    once: "One-time",
    daily: "Daily",
    weekly: "Weekly",
    monthly: "Monthly",
    yearly: "Yearly",
};

const monthLabels = [
    "",
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];

function formatEventTime(value: string | null) {
    if (!value) return "09:00";
    const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatSessionDateTime(value: string | null) {
    if (!value) return null;
    return new Date(value).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

function getEventSchedule(event: EventType) {
    const frequency = event.schedule_frequency || (event.recurrence_day ? "weekly" : "once");
    const label = frequencyLabels[frequency];
    const time = `${formatEventTime(event.start_time)} - ${formatEventTime(event.end_time || "11:00")}`;

    if (frequency === "weekly" && event.recurrence_day) return `${label} on ${event.recurrence_day} at ${time}`;
    if (frequency === "monthly" && event.recurrence_month_day) return `${label} on day ${event.recurrence_month_day} at ${time}`;
    if (frequency === "yearly" && event.recurrence_month && event.recurrence_month_day) {
        return `${label} on ${monthLabels[event.recurrence_month]} ${event.recurrence_month_day} at ${time}`;
    }
    return `${label} at ${time}`;
}

export default function SessionsClient({ 
    events, 
    activeSessions: initialActiveSessions 
}: { 
    events: EventType[], 
    activeSessions: ActiveSessionType[] 
}) {
    const router = useRouter();
    const supabase = useMemo(() => createClient(), []);
    const activeSessions = initialActiveSessions;
    const [isSubmitting, setIsSubmitting] = useState<string | null>(null); // Stores eventId or sessionId being processed
    const [sessionToEnd, setSessionToEnd] = useState<string | null>(null);
    const [liveCounts, setLiveCounts] = useState<Record<string, number>>({}); // sessionId -> count
    const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Manual proxy check-in modal state
    const [checkInModalSession, setCheckInModalSession] = useState<ActiveSessionType | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [isSearchingWorkers, setIsSearchingWorkers] = useState(false);
    const [searchResults, setSearchResults] = useState<Array<{
        id: string;
        first_name: string;
        last_name: string;
        email: string | null;
        phone: string | null;
        department: string | null;
        avatar_url: string | null;
        worker_id?: string | null;
        isCheckedIn: boolean;
    }>>([]);
    const [selectedReason, setSelectedReason] = useState("Sent on Errand");
    const [customReason, setCustomReason] = useState("");
    const [checkingInWorkerId, setCheckingInWorkerId] = useState<string | null>(null);
    const [checkInMessage, setCheckInMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const handleSearchWorkers = useCallback(async (query: string, sessionId: string) => {
        setIsSearchingWorkers(true);
        const res = await searchWorkersForCheckIn(query, sessionId);
        setIsSearchingWorkers(false);
        if (res.data) {
            setSearchResults(res.data);
        }
    }, []);

    useEffect(() => {
        if (!checkInModalSession) return;
        const timer = setTimeout(() => {
            handleSearchWorkers(searchQuery, checkInModalSession.id);
        }, 200);
        return () => clearTimeout(timer);
    }, [searchQuery, checkInModalSession, handleSearchWorkers]);

    const handlePerformManualCheckIn = async (workerId: string) => {
        if (!checkInModalSession) return;
        setCheckingInWorkerId(workerId);
        setCheckInMessage(null);

        const note = selectedReason === "Custom Note" ? customReason : selectedReason;
        const res = await manualWorkerCheckIn({
            workerId,
            sessionId: checkInModalSession.id,
            note: note || "Manually checked in by Admin",
        });

        setCheckingInWorkerId(null);

        if (res.error) {
            setCheckInMessage({ type: 'error', text: res.error });
        } else {
            setCheckInMessage({ type: 'success', text: "Worker checked in successfully!" });
            setSearchResults(prev => prev.map(w => w.id === workerId ? { ...w, isCheckedIn: true } : w));
            refreshSessions();
        }
    };

    const refreshSessions = useCallback(() => {
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

    // Fetch initial live counts for all active sessions
    useEffect(() => {
        const fetchInitialCounts = async () => {
            const counts: Record<string, number> = {};
            for (const session of activeSessions) {
                const { count } = await supabase
                    .from('attendance_logs')
                    .select('*', { count: 'exact', head: true })
                    .eq('session_id', session.id)
                    .eq('status', 'active');
                
                counts[session.id] = count || 0;
            }
            setLiveCounts(counts);
        };

        if (activeSessions.length > 0) {
            fetchInitialCounts();
        }
    }, [activeSessions, supabase]);

    // Subscribe to realtime attendance updates for the live count
    useEffect(() => {
        if (activeSessions.length === 0) return;

        const sessionIds = activeSessions.map(s => s.id);

        const channel = supabase.channel('admin-live-sessions')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'attendance_logs'
                    // We removed the status=eq.active filter because when a user checks out, 
                    // their status changes to 'completed', which would bypass the filter.
                },
                (payload) => {
                    // Make sure we have the new record
                    if (!payload.new || !('session_id' in payload.new)) return;
                    
                    const sid = payload.new.session_id as string;
                    if (!sessionIds.includes(sid)) return;

                    if (payload.eventType === 'INSERT' && payload.new.status === 'active') {
                        // New check-in
                        setLiveCounts(prev => ({ ...prev, [sid]: (prev[sid] || 0) + 1 }));
                    } 
                    else if (payload.eventType === 'UPDATE' && payload.new.status !== 'active') {
                        // User checked out manually
                        setLiveCounts(prev => ({ ...prev, [sid]: Math.max(0, (prev[sid] || 1) - 1) }));
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [activeSessions, supabase]);

    // Subscribe to session lifecycle changes created by admins or the database scheduler.
    useEffect(() => {
        const channel = supabase.channel('admin-session-lifecycle')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'attendance_sessions'
                },
                () => {
                    refreshSessions();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [refreshSessions, supabase]);

    const handleBeginSession = async (eventId: string) => {
        setIsSubmitting(eventId);
        const result = await beginSession(eventId);
        if (result.error) {
            alert(result.error);
            setIsSubmitting(null);
        } else {
            setIsSubmitting(null);
            refreshSessions();
        }
    };

    const handleEndSession = (sessionId: string) => {
        setSessionToEnd(sessionId);
    };

    const confirmEndSession = async () => {
        if (!sessionToEnd) return;
        
        setIsSubmitting(sessionToEnd);
        const result = await endSession(sessionToEnd);
        if (result.error) {
            alert(result.error);
            setIsSubmitting(null);
            setSessionToEnd(null);
        } else {
            setIsSubmitting(null);
            setSessionToEnd(null);
            refreshSessions();
        }
    };

    // Helper to format duration
    const getDuration = (startTime: string) => {
        const start = new Date(startTime).getTime();
        const now = new Date().getTime();
        const diffMins = Math.floor((now - start) / 60000);
        
        if (diffMins < 60) return `${diffMins}m`;
        const hours = Math.floor(diffMins / 60);
        const mins = diffMins % 60;
        return `${hours}h ${mins}m`;
    };

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Session Controller</h1>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                    Start sessions to broadcast to workers and allow check-ins.
                </p>
            </div>

            {/* ACTIVE SESSIONS PANEL */}
            {activeSessions.length > 0 && (
                <div className="mb-10">
                    <h2 className="text-sm font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                        Live Sessions
                    </h2>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {activeSessions.map(session => (
                            <motion.div 
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                key={session.id} 
                                className="bg-white dark:bg-[#0a0a0a] border border-red-500/30 rounded-2xl p-6 shadow-[0_0_30px_rgba(239,68,68,0.05)] relative overflow-hidden"
                            >
                                <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
                                
                                <div className="flex justify-between items-start mb-6 relative z-10">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-bold uppercase tracking-wide">
                                                Broadcasting
                                            </span>
                                            <span className="px-2 py-0.5 rounded-full bg-[#34A853]/10 text-[#34A853] text-xs font-bold uppercase tracking-wide">
                                                {session.started_by_mode === "auto" ? "Auto-started" : "Manual"}
                                            </span>
                                            <span className="text-neutral-400 text-xs flex items-center gap-1">
                                                <Clock className="w-3 h-3" /> {getDuration(session.start_time)}
                                            </span>
                                        </div>
                                        <h3 className="font-bold text-xl text-neutral-900 dark:text-white">
                                            {session.event.title}
                                        </h3>
                                        {session.scheduled_end_at && (
                                            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                                                Auto closes {formatSessionDateTime(session.scheduled_end_at)}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-4 p-4 bg-neutral-50 dark:bg-white/5 rounded-xl border border-neutral-100 dark:border-white/5 mb-6 relative z-10">
                                    <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-500/10 flex items-center justify-center text-red-500 shrink-0">
                                        <Activity className="w-6 h-6 animate-pulse" />
                                    </div>
                                    <div>
                                        <p className="text-sm text-neutral-500 dark:text-neutral-400 font-medium">Currently Checked In</p>
                                        <p className="text-2xl font-bold text-neutral-900 dark:text-white">
                                            {liveCounts[session.id] !== undefined ? liveCounts[session.id] : <Loader2 className="w-5 h-5 animate-spin text-neutral-400 mt-1" />}
                                        </p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 relative z-10">
                                    <button
                                        onClick={() => {
                                            setCheckInModalSession(session);
                                            setSearchQuery("");
                                            setCheckInMessage(null);
                                        }}
                                        className="flex items-center justify-center gap-2 bg-[#34A853] hover:bg-[#2b8a44] text-white px-4 py-3 rounded-xl text-sm font-bold transition-all shadow-sm shadow-[#34A853]/20"
                                    >
                                        <UserPlus className="w-4 h-4" />
                                        Sign In Worker
                                    </button>
                                    <button
                                        onClick={() => handleEndSession(session.id)}
                                        disabled={isSubmitting === session.id}
                                        className="flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-3 rounded-xl text-sm font-bold transition-all shadow-sm hover:shadow-[0_0_20px_rgba(239,68,68,0.3)] disabled:opacity-70"
                                    >
                                        {isSubmitting === session.id ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Square className="w-4 h-4 fill-current" />
                                        )}
                                        {isSubmitting === session.id ? "Ending..." : "End Session"}
                                    </button>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            )}

            {/* AVAILABLE EVENTS */}
            <div>
                <h2 className="text-sm font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider mb-4">
                    Available Events
                </h2>
                
                {events.length === 0 ? (
                    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 rounded-2xl p-8 text-center">
                        <p className="text-neutral-500 dark:text-neutral-400 text-sm">
                            No events found. Go to the Events tab to create one first.
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {events.map((event) => {
                            const isActive = activeSessions.some(s => s.event_id === event.id);
                            
                            if (isActive) return null; // Don't show active events in this list

                            return (
                                <div 
                                    key={event.id}
                                    className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 rounded-2xl p-5 shadow-sm flex flex-col justify-between"
                                >
                                    <div className="mb-6">
                                        <div className="w-10 h-10 rounded-full bg-[#34A853]/10 flex items-center justify-center text-[#34A853] mb-3">
                                            <Calendar className="w-5 h-5" />
                                        </div>
                                        <h3 className="font-semibold text-neutral-900 dark:text-white line-clamp-1">
                                            {event.title}
                                        </h3>
                                        <p className="mt-1 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                                            {getEventSchedule(event)}
                                        </p>
                                    </div>
                                    
                                    <button
                                        onClick={() => handleBeginSession(event.id)}
                                        disabled={isSubmitting === event.id}
                                        className="w-full flex items-center justify-center gap-2 bg-neutral-100 dark:bg-white/5 hover:bg-[#34A853] hover:text-white text-neutral-700 dark:text-neutral-300 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 group"
                                    >
                                        {isSubmitting === event.id ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Play className="w-4 h-4 group-hover:fill-current" />
                                        )}
                                        Begin Session
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* End Session Confirmation Modal */}
            <AnimatePresence>
                {sessionToEnd && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setSessionToEnd(null)}
                            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white dark:bg-[#0f0f0f] border border-neutral-200 dark:border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden"
                        >
                            <div className="p-6 border-b border-neutral-100 dark:border-white/5 flex items-center justify-between">
                                <h2 className="text-xl font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                                    <AlertTriangle className="w-5 h-5 text-red-500" />
                                    End Live Session
                                </h2>
                                <button
                                    onClick={() => setSessionToEnd(null)}
                                    className="p-2 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5 rounded-full transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="p-6">
                                <p className="text-neutral-600 dark:text-neutral-400 mb-6">
                                    Are you sure you want to end this session? All workers who are currently checked in will be <strong className="text-neutral-900 dark:text-white">automatically checked out</strong> and the session will be closed permanently.
                                </p>

                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setSessionToEnd(null)}
                                        className="flex-1 py-2.5 border border-neutral-200 dark:border-white/10 text-neutral-700 dark:text-white/70 hover:bg-neutral-50 dark:hover:bg-white/5 rounded-xl font-medium transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={confirmEndSession}
                                        disabled={isSubmitting === sessionToEnd}
                                        className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isSubmitting === sessionToEnd ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Square className="w-4 h-4 fill-current" />
                                        )}
                                        End Session
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* MANUAL PROXY CHECK-IN MODAL */}
            <AnimatePresence>
                {checkInModalSession && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setCheckInModalSession(null)}
                            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-xl bg-white dark:bg-[#0f0f0f] border border-neutral-200 dark:border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden max-h-[90vh] flex flex-col"
                        >
                            {/* Modal Header */}
                            <div className="p-5 border-b border-neutral-100 dark:border-white/5 flex items-center justify-between shrink-0">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="px-2 py-0.5 rounded-full bg-[#34A853]/10 text-[#34A853] text-[10px] font-bold uppercase tracking-wider">
                                            Admin Proxy Check-In
                                        </span>
                                    </div>
                                    <h2 className="text-lg font-bold text-neutral-900 dark:text-white mt-1">
                                        Sign In Worker for {checkInModalSession.event.title}
                                    </h2>
                                </div>
                                <button
                                    onClick={() => setCheckInModalSession(null)}
                                    className="p-2 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5 rounded-full transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="p-5 overflow-y-auto space-y-4 flex-1">
                                {/* Search Bar */}
                                <div className="relative">
                                    <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                                    <input
                                        type="text"
                                        placeholder="Search worker by name, email, department..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2.5 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#34A853]/50 text-sm text-neutral-900 dark:text-white"
                                    />
                                    {isSearchingWorkers && (
                                        <Loader2 className="w-4 h-4 animate-spin text-[#34A853] absolute right-3.5 top-1/2 -translate-y-1/2" />
                                    )}
                                </div>

                                {/* Reason Selector */}
                                <div>
                                    <label className="block text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-2">
                                        Check-In Note / Reason
                                    </label>
                                    <div className="flex flex-wrap gap-2">
                                        {["Sent on Errand", "Permission Granted", "No Smartphone / Manual", "Guest / Special Service", "Custom Note"].map((reason) => (
                                            <button
                                                key={reason}
                                                type="button"
                                                onClick={() => setSelectedReason(reason)}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                                    selectedReason === reason
                                                        ? "bg-[#34A853] text-white"
                                                        : "bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-white/10"
                                                }`}
                                            >
                                                {reason}
                                            </button>
                                        ))}
                                    </div>
                                    {selectedReason === "Custom Note" && (
                                        <input
                                            type="text"
                                            placeholder="Type custom check-in note..."
                                            value={customReason}
                                            onChange={(e) => setCustomReason(e.target.value)}
                                            className="w-full mt-2 px-3 py-2 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 rounded-lg text-xs text-neutral-900 dark:text-white"
                                        />
                                    )}
                                </div>

                                {/* Feedback Message */}
                                {checkInMessage && (
                                    <div className={`p-3 rounded-xl text-xs font-medium flex items-center justify-between ${
                                        checkInMessage.type === 'success' 
                                            ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/20'
                                            : 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/20'
                                    }`}>
                                        <span>{checkInMessage.text}</span>
                                        <button onClick={() => setCheckInMessage(null)} className="text-current opacity-70 hover:opacity-100">
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                )}

                                {/* Workers List */}
                                <div className="space-y-2">
                                    <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                                        Workers Directory ({searchResults.length})
                                    </h3>

                                    {searchResults.length === 0 ? (
                                        <div className="p-8 text-center bg-neutral-50 dark:bg-neutral-900/50 rounded-xl border border-dashed border-neutral-200 dark:border-white/10">
                                            <User className="w-8 h-8 text-neutral-400 mx-auto mb-2 opacity-50" />
                                            <p className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">
                                                No workers found matching &quot;{searchQuery}&quot;
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                                            {searchResults.map((worker) => (
                                                <div
                                                    key={worker.id}
                                                    className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 dark:bg-white/5 border border-neutral-100 dark:border-white/5"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-9 h-9 rounded-full bg-[#34A853]/10 text-[#34A853] font-bold text-xs flex items-center justify-center shrink-0">
                                                            {worker.first_name?.[0]}{worker.last_name?.[0]}
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <p className="text-sm font-semibold text-neutral-900 dark:text-white">
                                                                    {worker.first_name} {worker.last_name}
                                                                </p>
                                                                {worker.worker_id && (
                                                                    <span className="px-1.5 py-0.5 bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-300 text-[10px] font-mono font-semibold rounded shrink-0">
                                                                        {worker.worker_id}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-xs text-neutral-500 dark:text-neutral-400">
                                                                {worker.department || "General"} {worker.phone ? `• ${worker.phone}` : ""}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    {worker.isCheckedIn ? (
                                                        <span className="flex items-center gap-1 text-xs font-bold text-[#34A853] bg-[#34A853]/10 px-3 py-1.5 rounded-lg shrink-0">
                                                            <Check className="w-3.5 h-3.5" /> Checked In
                                                        </span>
                                                    ) : (
                                                        <button
                                                            onClick={() => handlePerformManualCheckIn(worker.id)}
                                                            disabled={checkingInWorkerId === worker.id}
                                                            className="flex items-center gap-1.5 bg-[#34A853] hover:bg-[#2b8a44] text-white text-xs font-semibold px-3.5 py-1.5 rounded-lg transition-colors disabled:opacity-50 shrink-0"
                                                        >
                                                            {checkingInWorkerId === worker.id ? (
                                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                            ) : (
                                                                <UserCheck className="w-3.5 h-3.5" />
                                                            )}
                                                            Sign In
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}
