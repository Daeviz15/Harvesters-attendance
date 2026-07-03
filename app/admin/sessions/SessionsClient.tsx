"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { Activity, Calendar, Play, Square, Clock, Loader2, AlertTriangle, X } from "lucide-react";
import { beginSession, endSession } from "./actions";
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

                                <button
                                    onClick={() => handleEndSession(session.id)}
                                    disabled={isSubmitting === session.id}
                                    className="w-full flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-3 rounded-xl text-sm font-bold transition-all shadow-sm hover:shadow-[0_0_20px_rgba(239,68,68,0.3)] disabled:opacity-70 relative z-10"
                                >
                                    {isSubmitting === session.id ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Square className="w-4 h-4 fill-current" />
                                    )}
                                    {isSubmitting === session.id ? "Ending Session..." : "End Session & Auto-Checkout"}
                                </button>
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
        </div>
    );
}
