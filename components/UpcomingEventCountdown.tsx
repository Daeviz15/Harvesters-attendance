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
            className="mb-8 max-w-3xl overflow-hidden rounded-3xl border border-blue-500/20 bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent shadow-lg shadow-blue-950/5"
        >
            <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                <div className="flex min-w-0 items-start gap-4">
                    <div className="shrink-0 rounded-2xl bg-blue-500/15 p-3 text-blue-500 dark:text-blue-400">
                        <CalendarClock className="h-6 w-6" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">
                            Up next
                        </p>
                        <h2 id="upcoming-event-title" className="mt-1 truncate text-xl font-bold text-neutral-900 dark:text-white" title={event.title}>
                            {event.title}
                        </h2>
                        <time dateTime={event.scheduledStartAt} className="mt-2 block text-sm font-medium text-neutral-600 dark:text-white/55">
                            {formattedStart}
                        </time>
                        {event.locationName && (
                            <p className="mt-2 flex items-center gap-1.5 text-xs text-neutral-500 dark:text-white/40">
                                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                <span className="truncate" title={event.locationName}>{event.locationName}</span>
                            </p>
                        )}
                    </div>
                </div>

                <div className="shrink-0" aria-label={`Starts in ${remaining.days} days, ${remaining.hours} hours, ${remaining.minutes} minutes`}>
                    <p className="mb-2 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-500 dark:text-white/35">
                        Starts in
                    </p>
                    <div className="flex items-center justify-center gap-2" aria-live="off">
                        {countdownParts.map((part) => (
                            <div key={part.label} className="min-w-14 rounded-2xl border border-neutral-200 bg-white/70 px-3 py-2 text-center dark:border-white/10 dark:bg-white/5">
                                <span className="block font-mono text-xl font-black tabular-nums text-neutral-900 dark:text-white">
                                    {String(part.value).padStart(2, "0")}
                                </span>
                                <span className="mt-0.5 block text-[9px] font-bold uppercase tracking-wider text-neutral-500 dark:text-white/35">
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
