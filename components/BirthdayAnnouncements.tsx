"use client";

import { useState } from "react";
import Image from "next/image";
import { CakeSlice, Sparkles, Gift } from "lucide-react";
import type { UpcomingBirthday } from "@/lib/types";

function displayName(birthday: UpcomingBirthday) {
    return `${birthday.first_name} ${birthday.last_name}`.trim();
}

function birthdayDateLabel(birthday: UpcomingBirthday) {
    return new Intl.DateTimeFormat("en-NG", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
    }).format(new Date(Date.UTC(2000, birthday.birthday_month - 1, birthday.birthday_day)));
}

function relativeBirthdayLabel(daysUntil: number) {
    if (daysUntil === 0) return "Today";
    if (daysUntil === 1) return "Tomorrow";
    return `In ${daysUntil} days`;
}

/**
 * Resilient avatar that supports Google OAuth CDN URLs (via referrerPolicy="no-referrer")
 * and smoothly falls back to styled initials if an image fails to load or 404s.
 */
export function BirthdayAvatar({
    avatarUrl,
    initials,
    isToday,
}: {
    avatarUrl?: string | null;
    initials: string;
    isToday: boolean;
}) {
    const [hasError, setHasError] = useState(false);
    const validUrl = avatarUrl && avatarUrl.trim().length > 0 ? avatarUrl.trim() : null;
    const shouldShowImage = Boolean(validUrl && !hasError);

    return (
        <div className="relative shrink-0">
            <div
                className={`flex h-10 w-10 items-center justify-center rounded-full border overflow-hidden relative ${
                    isToday
                        ? "border-[#34A853] bg-[#34A853]/20 ring-2 ring-[#34A853]/30"
                        : "border-[#34A853]/25 bg-[#34A853]/10"
                }`}
            >
                {shouldShowImage ? (
                    <Image
                        src={validUrl!}
                        alt=""
                        fill
                        unoptimized
                        referrerPolicy="no-referrer"
                        className="object-cover"
                        sizes="40px"
                        onError={() => setHasError(true)}
                    />
                ) : (
                    <span className="text-[12px] font-bold text-[#34A853] select-none">
                        {initials}
                    </span>
                )}
            </div>
            {isToday && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#34A853] text-[9px] text-white shadow-sm">
                    🎂
                </span>
            )}
        </div>
    );
}

/**
 * High-end Upcoming Birthdays panel designed to sit on the right side
 * of the worker dashboard, filling space with a vibrant, community-focused celebrant list.
 */
export function UpcomingBirthdaysPanel({
    birthdays,
    className = "",
}: {
    birthdays: UpcomingBirthday[];
    className?: string;
}) {
    const todayCount = birthdays.filter(b => b.days_until === 0).length;

    return (
        <section
            aria-labelledby="upcoming-birthdays-heading"
            className={`w-full rounded-2xl border border-neutral-200/80 dark:border-white/10 bg-neutral-100/50 dark:bg-white/[0.025] backdrop-blur-xl p-5 sm:p-6 shadow-sm transition-all flex flex-col ${className}`}
        >
            {/* Header */}
            <div className="flex items-center justify-between pb-4 mb-3 border-b border-neutral-200/60 dark:border-white/5">
                <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#34A853]/15 border border-[#34A853]/25 text-[#34A853] shrink-0">
                        <CakeSlice className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <div>
                        <h2 id="upcoming-birthdays-heading" className="text-[12px] font-bold uppercase tracking-[0.16em] text-neutral-800 dark:text-white/90">
                            Upcoming Birthdays
                        </h2>
                        <p className="text-[11px] text-neutral-500 dark:text-white/40">
                            Celebrating our workforce family
                        </p>
                    </div>
                </div>

                {birthdays.length > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#34A853]/10 border border-[#34A853]/20 px-2.5 py-0.5 text-[11px] font-bold text-[#34A853]">
                        {todayCount > 0 ? (
                            <>
                                <Sparkles className="w-3 h-3 text-[#34A853] animate-pulse" />
                                {todayCount} Today!
                            </>
                        ) : (
                            `${birthdays.length} upcoming`
                        )}
                    </span>
                )}
            </div>

            {/* Content List */}
            {birthdays.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-200/50 dark:bg-white/5 text-neutral-400 dark:text-white/30">
                        <Gift className="h-5 w-5" />
                    </div>
                    <p className="text-[13px] font-medium text-neutral-600 dark:text-white/60">
                        No upcoming birthdays soon
                    </p>
                    <p className="text-[11px] text-neutral-400 dark:text-white/30 max-w-[220px]">
                        Birthdays occurring within the next 45 days will appear here.
                    </p>
                </div>
            ) : (
                <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1 no-scrollbar flex-1">
                    {birthdays.map((birthday, index) => {
                        const name = displayName(birthday);
                        const initials = `${birthday.first_name[0] || ""}${birthday.last_name[0] || ""}`.toUpperCase() || "HB";
                        const isToday = birthday.days_until === 0;
                        const isTomorrow = birthday.days_until === 1;

                        return (
                            <div
                                key={`${name}-${birthday.next_birthday}-${index}`}
                                className={`flex items-center gap-3 p-2.5 rounded-xl transition-all ${
                                    isToday
                                        ? "bg-[#34A853]/10 border border-[#34A853]/30 shadow-sm"
                                        : "hover:bg-neutral-200/50 dark:hover:bg-white/5 border border-transparent"
                                }`}
                            >
                                {/* Avatar */}
                                <BirthdayAvatar
                                    avatarUrl={birthday.avatar_url}
                                    initials={initials}
                                    isToday={isToday}
                                />

                                {/* Details */}
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-1.5">
                                        <p className="truncate text-[13px] sm:text-[14px] font-semibold text-neutral-800 dark:text-white/95">
                                            {name}
                                        </p>
                                        <span className={`shrink-0 text-[10px] font-bold ${
                                            isToday
                                                ? "text-[#34A853] uppercase tracking-wider bg-[#34A853]/15 px-2 py-0.5 rounded-md"
                                                : isTomorrow
                                                ? "text-amber-600 dark:text-amber-400"
                                                : "text-neutral-500 dark:text-white/50"
                                        }`}>
                                            {relativeBirthdayLabel(birthday.days_until)}
                                        </span>
                                    </div>
                                    <p className="truncate text-[11px] text-neutral-500 dark:text-white/50 mt-0.5">
                                        <span className="font-medium text-neutral-700 dark:text-white/70">
                                            {birthday.department_name}
                                        </span>
                                        <span className="mx-1 text-neutral-400 dark:text-white/30">•</span>
                                        <span>{birthdayDateLabel(birthday)}</span>
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </section>
    );
}

/**
 * Backward compatibility alias for sidebar if needed anywhere.
 */
export function UpcomingBirthdaysSidebar({
    birthdays,
}: {
    birthdays: UpcomingBirthday[];
}) {
    return <UpcomingBirthdaysPanel birthdays={birthdays} />;
}

export function AdminBirthdayAnnouncement({
    birthdays,
}: {
    birthdays: UpcomingBirthday[];
}) {
    const nextBirthday = birthdays[0];
    if (!nextBirthday) return null;

    const sameDayBirthdays = birthdays.filter(
        (birthday) => birthday.next_birthday === nextBirthday.next_birthday,
    );
    const names = sameDayBirthdays.slice(0, 2).map(displayName).join(" and ");
    const remaining = Math.max(0, sameDayBirthdays.length - 2);

    return (
        <section
            aria-label="Upcoming birthday announcement"
            className="border-b border-[#34A853]/20 bg-[#34A853]/[0.06] px-4 py-2.5 sm:px-6 lg:px-8"
        >
            <div className="mx-auto flex max-w-[1600px] items-center gap-3 text-sm">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#34A853]/15 text-[#34A853]">
                    <CakeSlice className="h-4 w-4" aria-hidden="true" />
                </span>
                <p className="min-w-0 text-neutral-700 dark:text-white/75">
                    <span className="font-bold text-[#34A853]">
                        Upcoming birthday:
                    </span>{" "}
                    <span className="font-semibold text-neutral-900 dark:text-white">{names}</span>
                    {remaining > 0 ? ` and ${remaining} more` : ""}
                    <span className="text-neutral-500 dark:text-white/50">
                        {` · ${birthdayDateLabel(nextBirthday)} · ${relativeBirthdayLabel(nextBirthday.days_until)} · ${nextBirthday.department_name}`}
                    </span>
                </p>
            </div>
        </section>
    );
}
