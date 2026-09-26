"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Clock, X, Loader2, Zap, AlertCircle, Calendar, ArrowRight } from "lucide-react";
import { quickStartEvent } from "@/app/admin/events/actions";
import { calculateQuickStartSchedule } from "@/lib/event-schedule-utils";

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
    timezone: string | null;
    department_id: string | null;
};

interface QuickStartEventModalProps {
    isOpen: boolean;
    event: EventType | null;
    onClose: () => void;
    onSuccess: (result: {
        sessionId: string;
        newStartTime: string;
        newEndTime: string;
        newStartDate: string;
    }) => void;
    departmentName?: string;
}

function formatDisplayTime(timeStr: string) {
    if (!timeStr) return "";
    const [h, m] = timeStr.slice(0, 5).split(":").map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function QuickStartEventModal({
    isOpen,
    event,
    onClose,
    onSuccess,
    departmentName,
}: QuickStartEventModalProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [customDurationMinutes, setCustomDurationMinutes] = useState<number | null>(null);
    const [customEndTime, setCustomEndTime] = useState<string>("");

    // Initial computation based on event
    const initialSchedule = useMemo(() => {
        if (!event) return null;
        return calculateQuickStartSchedule(event, {
            overrideDurationMinutes: customDurationMinutes || undefined,
            customEndTime: customEndTime || undefined,
        });
    }, [event, customDurationMinutes, customEndTime]);

    // Reset state when opened with a new event
    useEffect(() => {
        if (isOpen && event) {
            setError(null);
            setIsSubmitting(false);
            setCustomDurationMinutes(null);
            setCustomEndTime("");
        }
    }, [isOpen, event]);

    // Handle Escape key for accessibility
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && !isSubmitting) {
                onClose();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, isSubmitting, onClose]);

    if (!isOpen || !event || !initialSchedule) return null;

    const originalStartTime = event.start_time ? formatDisplayTime(event.start_time) : "Not set";
    const originalEndTime = event.end_time ? formatDisplayTime(event.end_time) : "Not set";

    const originalDurationMins = (() => {
        if (!event.start_time || !event.end_time) return 120;
        const [sH, sM] = event.start_time.slice(0, 5).split(":").map(Number);
        const [eH, eM] = event.end_time.slice(0, 5).split(":").map(Number);
        const diff = (eH * 60 + eM) - (sH * 60 + sM);
        return diff > 0 ? diff : 120;
    })();

    const handleQuickStart = async () => {
        if (!event) return;
        setIsSubmitting(true);
        setError(null);

        try {
            const res = await quickStartEvent(event.id, {
                customStartTime: initialSchedule.newStartTime,
                customEndTime: initialSchedule.newEndTime,
                overrideDurationMinutes: initialSchedule.durationMinutes,
            });

            if (res.error) {
                setError(res.error);
                setIsSubmitting(false);
            } else if (res.success && res.sessionId) {
                setIsSubmitting(false);
                onSuccess({
                    sessionId: res.sessionId,
                    newStartTime: res.newStartTime,
                    newEndTime: res.newEndTime,
                    newStartDate: res.newStartDate,
                });
                onClose();
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "An unexpected error occurred.");
            setIsSubmitting(false);
        }
    };

    const durationPresets = [
        { label: "Keep Original", minutes: originalDurationMins },
        { label: "30 mins", minutes: 30 },
        { label: "1 hour", minutes: 60 },
        { label: "2 hours", minutes: 120 },
        { label: "3 hours", minutes: 180 },
    ];

    const currentDuration = customDurationMinutes ?? originalDurationMins;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 overflow-hidden bg-black/75 backdrop-blur-md">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => {
                        if (!isSubmitting) onClose();
                    }}
                    className="fixed inset-0 bg-black/75 backdrop-blur-sm"
                />

                <motion.div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="quick-start-title"
                    initial={{ opacity: 0, scale: 0.95, y: 16 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 16 }}
                    className="relative z-10 w-full max-w-lg max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)] flex flex-col rounded-2xl sm:rounded-3xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#111111] text-neutral-900 dark:text-white shadow-2xl overflow-hidden my-auto"
                >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3 p-4 sm:p-6 pb-3 sm:pb-4 border-b border-neutral-100 dark:border-white/5 bg-neutral-50/80 dark:bg-black/40 shrink-0">
                        <div className="flex items-start gap-3 min-w-0">
                            <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-[#34A853]/15 text-[#34A853] shrink-0 mt-0.5">
                                <Play className="h-4 w-4 sm:h-5 sm:w-5 fill-current" />
                            </div>
                            <div className="min-w-0">
                                <h2 id="quick-start-title" className="text-base sm:text-lg font-bold tracking-tight text-neutral-900 dark:text-white leading-tight">
                                    Quick Start Event
                                </h2>
                                <p className="mt-1 text-xs sm:text-sm text-neutral-500 dark:text-white/55">
                                    Start this event ahead of schedule and activate live attendance.
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isSubmitting}
                            aria-label="Close modal"
                            className="rounded-full p-1.5 text-neutral-400 hover:text-neutral-600 dark:text-white/40 dark:hover:text-white transition hover:bg-neutral-100 dark:hover:bg-white/5 disabled:opacity-50 shrink-0 -mr-1"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    {/* Scrollable Body */}
                    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 overscroll-contain">
                        {/* Event Overview Card */}
                        <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-neutral-50/70 dark:bg-white/[0.03] p-4">
                            <div className="flex items-center justify-between gap-2">
                                <h3 className="font-bold text-sm sm:text-base text-neutral-900 dark:text-white truncate">
                                    {event.title}
                                </h3>
                                {departmentName && (
                                    <span className="shrink-0 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400">
                                        {departmentName}
                                    </span>
                                )}
                            </div>
                            <div className="mt-2 flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                                <Calendar className="w-3.5 h-3.5 text-[#34A853]" />
                                <span>Originally scheduled: <span className="font-medium text-neutral-700 dark:text-neutral-300">{originalStartTime} – {originalEndTime}</span></span>
                            </div>
                        </div>

                        {/* Schedule Change Highlight */}
                        <div className="rounded-2xl border border-[#34A853]/25 bg-[#34A853]/5 dark:bg-[#34A853]/10 p-4 space-y-3">
                            <div className="flex items-center gap-2 text-xs font-bold text-[#34A853] uppercase tracking-wider">
                                <Zap className="w-3.5 h-3.5" />
                                <span>New Live Schedule</span>
                            </div>

                            <div className="grid grid-cols-2 gap-3 items-center">
                                <div className="rounded-xl bg-white dark:bg-black/40 border border-neutral-200 dark:border-white/10 p-3">
                                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400">New Start Time</p>
                                    <p className="text-base sm:text-lg font-bold text-[#34A853] mt-0.5">
                                        {formatDisplayTime(initialSchedule.newStartTime)}
                                    </p>
                                    <p className="text-[10px] text-neutral-400 dark:text-neutral-500">Starts right now</p>
                                </div>

                                <div className="rounded-xl bg-white dark:bg-black/40 border border-neutral-200 dark:border-white/10 p-3">
                                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400">New End Time</p>
                                    <p className="text-base sm:text-lg font-bold text-neutral-900 dark:text-white mt-0.5">
                                        {formatDisplayTime(initialSchedule.newEndTime)}
                                    </p>
                                    <p className="text-[10px] text-neutral-400 dark:text-neutral-500">
                                        {initialSchedule.durationMinutes >= 60
                                            ? `${Math.floor(initialSchedule.durationMinutes / 60)}h ${initialSchedule.durationMinutes % 60 ? (initialSchedule.durationMinutes % 60) + 'm' : ''}`
                                            : `${initialSchedule.durationMinutes} mins`} duration
                                    </p>
                                </div>
                            </div>

                            {/* Duration Presets */}
                            <div>
                                <label className="block text-[11px] font-semibold text-neutral-600 dark:text-neutral-400 mb-1.5">
                                    Adjust Duration
                                </label>
                                <div className="flex flex-wrap gap-1.5">
                                    {durationPresets.map((preset) => {
                                        const isSelected = currentDuration === preset.minutes && !customEndTime;
                                        return (
                                            <button
                                                key={preset.label}
                                                type="button"
                                                onClick={() => {
                                                    setCustomDurationMinutes(preset.minutes);
                                                    setCustomEndTime("");
                                                }}
                                                className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all ${
                                                    isSelected
                                                        ? "bg-[#34A853] text-white shadow-sm"
                                                        : "bg-white dark:bg-white/5 border border-neutral-200 dark:border-white/10 text-neutral-600 dark:text-neutral-300 hover:border-[#34A853]/50"
                                                }`}
                                            >
                                                {preset.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* What Happens Checklist */}
                        <div className="rounded-xl bg-neutral-50 dark:bg-white/5 p-3.5 space-y-2 text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
                            <div className="flex items-start gap-2">
                                <span className="text-[#34A853] font-bold">✓</span>
                                <span>Updates event start time to <strong>{formatDisplayTime(initialSchedule.newStartTime)}</strong> in the database</span>
                            </div>
                            <div className="flex items-start gap-2">
                                <span className="text-[#34A853] font-bold">✓</span>
                                <span>Sets session end time to <strong>{formatDisplayTime(initialSchedule.newEndTime)}</strong></span>
                            </div>
                            <div className="flex items-start gap-2">
                                <span className="text-[#34A853] font-bold">✓</span>
                                <span>Immediately starts live attendance so workers can check in</span>
                            </div>
                        </div>

                        {/* Error Alert */}
                        {error && (
                            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs sm:text-sm text-red-600 dark:text-red-400 flex items-start gap-2">
                                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                                <span>{error}</span>
                            </div>
                        )}
                    </div>

                    {/* Actions / Footer */}
                    <div className="p-3.5 sm:p-5 border-t border-neutral-100 dark:border-white/5 bg-neutral-50/80 dark:bg-[#111111] shrink-0 grid grid-cols-2 gap-2.5 sm:gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isSubmitting}
                            className="rounded-xl border border-neutral-200 dark:border-white/10 px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-bold text-neutral-700 dark:text-white/70 transition hover:bg-neutral-100 dark:hover:bg-white/5 disabled:opacity-50 text-center"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleQuickStart}
                            disabled={isSubmitting}
                            className="inline-flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl bg-[#34A853] hover:bg-[#2b8a44] px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-bold text-white transition disabled:opacity-50 text-center shadow-lg shadow-[#34A853]/25"
                        >
                            {isSubmitting ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Play className="h-3.5 w-3.5 sm:h-4 sm:w-4 fill-current" />
                            )}
                            <span className="truncate">Quick Start Now</span>
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
