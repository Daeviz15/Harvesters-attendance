"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, MapPin } from "lucide-react";
import type { UpcomingEvent } from "@/lib/types";

const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;

function getTimeParts(milliseconds: number) {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / SECOND_MS));
    const days = Math.floor(totalSeconds / 86_400);
    const hours = Math.floor((totalSeconds % 86_400) / 3_600);
    const minutes = Math.floor((totalSeconds % 3_600) / 60);
    const seconds = totalSeconds % 60;

    return { days, hours, minutes, seconds };
}

function formatEventDateTime(value: string, timezone: string) {
    try {
        return new Intl.DateTimeFormat("en-NG", {
            timeZone: timezone,
            weekday: "short",
            day: "numeric",
            month: "short",
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
        }).format(new Date(value));
    } catch {
        return new Intl.DateTimeFormat("en-NG", {
            timeZone: "Africa/Lagos",
            weekday: "short",
            day: "numeric",
            month: "short",
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
        }).format(new Date(value));
    }
}

export default function UpcomingEventCountdown({
    event,
    serverNow,
}: {
    event: UpcomingEvent | null;
    serverNow: string;
}) {
    const router = useRouter();
    const initialNow = Date.parse(serverNow);
    const [nowMs, setNowMs] = useState(Number.isFinite(initialNow) ? initialNow : 0);
    const previousNowRef = useRef(nowMs);

    const startMs = event ? Date.parse(event.scheduledStartAt) : 0;
    const endMs = event ? Date.parse(event.scheduledEndAt) : 0;

    useEffect(() => {
        if (!event || !Number.isFinite(startMs) || !Number.isFinite(endMs)) return;

        let timeout: ReturnType<typeof setTimeout> | null = null;
        let cancelled = false;
        previousNowRef.current = Date.now();

        const tick = () => {
            if (cancelled) return;

            const currentNow = Date.now();
            const previousNow = previousNowRef.current;
            previousNowRef.current = currentNow;
            setNowMs(currentNow);

            const crossedStart = previousNow < startMs && currentNow >= startMs;
            const crossedEnd = previousNow < endMs && currentNow >= endMs;
            if (crossedStart || crossedEnd) {
                router.refresh();
            }

            if (currentNow >= endMs) return;

            const untilStart = startMs - currentNow;
            const untilEnd = endMs - currentNow;
            const nextDelay = currentNow < startMs
                ? (untilStart > HOUR_MS ? MINUTE_MS : SECOND_MS)
                : Math.min(MINUTE_MS, Math.max(SECOND_MS, untilEnd));

            timeout = setTimeout(tick, nextDelay);
        };

        const firstDelay = Date.now() < startMs && startMs - Date.now() > HOUR_MS
            ? MINUTE_MS
            : SECOND_MS;
        timeout = setTimeout(tick, firstDelay);

        return () => {
            cancelled = true;
            if (timeout) clearTimeout(timeout);
        };
    }, [event, startMs, endMs, router]);

    const formattedStart = useMemo(
        () => event ? formatEventDateTime(event.scheduledStartAt, event.timezone) : "",
        [event],
    );

    if (!event || event.isInProgress || !Number.isFinite(startMs) || nowMs >= startMs) {
        return null;
    }

    const remaining = getTimeParts(startMs - nowMs);
    const countdownParts = remaining.days > 0
        ? [
            { value: remaining.days, label: remaining.days === 1 ? "day" : "days" },
            { value: remaining.hours, label: "hrs" },
            { value: remaining.minutes, label: "min" },
        ]
        : [
            { value: remaining.hours, label: "hrs" },
            { value: remaining.minutes, label: "min" },
            { value: remaining.seconds, label: "sec" },
        ];

    return (
        <section
            aria-labelledby="upcoming-event-title"
            className="mb-4 max-w-xl overflow-hidden rounded-2xl border border-[#34A853]/25 bg-gradient-to-r from-[#34A853]/10 via-[#34A853]/[0.03] to-transparent shadow-sm shadow-[#34A853]/5"
        >
            <div className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-3">
                <div className="flex min-w-0 items-center gap-3">
                    <div className="shrink-0 rounded-xl bg-[#34A853]/15 p-2 text-[#34A853]">
                        <CalendarClock className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#34A853]">
                                Up next
                            </span>
                        </div>
                        <h2 id="upcoming-event-title" className="truncate text-sm sm:text-base font-bold text-neutral-900 dark:text-white" title={event.title}>
                            {event.title}
                        </h2>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-neutral-600 dark:text-white/55 mt-0.5">
                            <time dateTime={event.scheduledStartAt} className="font-medium">
                                {formattedStart}
                            </time>
                            {event.locationName && (
                                <span className="flex items-center gap-1 text-neutral-500 dark:text-white/40">
                                    <span>•</span>
                                    <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                                    <span className="truncate max-w-[170px]" title={event.locationName}>{event.locationName}</span>
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="shrink-0 pt-1 sm:pt-0" aria-label={`Starts in ${remaining.days} days, ${remaining.hours} hours, ${remaining.minutes} minutes`}>
                    <p className="mb-1 text-left sm:text-right text-[9px] font-bold uppercase tracking-[0.16em] text-neutral-500 dark:text-white/40">
                        Starts in
                    </p>
                    <div className="flex items-center justify-start sm:justify-end gap-1.5" aria-live="off">
                        {countdownParts.map((part) => (
                            <div key={part.label} className="min-w-10 sm:min-w-11 rounded-xl border border-neutral-200/80 bg-white/70 px-2 py-1 text-center dark:border-white/10 dark:bg-white/5">
                                <span className="block font-mono text-sm sm:text-base font-black tabular-nums text-neutral-900 dark:text-white">
                                    {String(part.value).padStart(2, "0")}
                                </span>
                                <span className="block text-[8px] font-bold uppercase tracking-wider text-neutral-500 dark:text-white/40">
                                    {part.label}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}
