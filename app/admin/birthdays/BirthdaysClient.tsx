"use client";

import { useMemo, useState } from "react";
import { Cake, Phone, Search } from "lucide-react";
import { BirthdayAvatar } from "@/components/BirthdayAnnouncements";

export type AdminBirthday = {
    id: string;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
    phone: string | null;
    department: string;
    team: string | null;
    month: number;
    day: number;
    daysUntil: number;
};

const RANGES = [
    { label: "Next 7 days", days: 7 },
    { label: "Next 30 days", days: 30 },
    { label: "Next 3 months", days: 90 },
    { label: "Full year", days: 366 },
] as const;

function dateLabel(month: number, day: number) {
    return new Intl.DateTimeFormat("en-NG", { weekday: undefined, month: "long", day: "numeric", timeZone: "UTC" })
        .format(new Date(Date.UTC(2000, month - 1, day)));
}

function whenLabel(daysUntil: number) {
    if (daysUntil === 0) return "Today 🎉";
    if (daysUntil === 1) return "Tomorrow";
    return `In ${daysUntil} days`;
}

function groupName(daysUntil: number) {
    if (daysUntil === 0) return "Today";
    if (daysUntil <= 7) return "This week";
    if (daysUntil <= 30) return "Within a month";
    return "Later";
}

export default function BirthdaysClient({
    birthdays,
    scopeLabel,
    loadError,
}: {
    birthdays: AdminBirthday[];
    scopeLabel: string;
    loadError: boolean;
}) {
    const [rangeDays, setRangeDays] = useState<number>(30);
    const [search, setSearch] = useState("");

    const groups = useMemo(() => {
        const term = search.trim().toLowerCase();
        const shown = birthdays.filter((b) =>
            b.daysUntil <= rangeDays
            && (!term || `${b.firstName} ${b.lastName} ${b.department} ${b.team ?? ""}`.toLowerCase().includes(term)),
        );
        const map = new Map<string, AdminBirthday[]>();
        for (const b of shown) {
            const key = groupName(b.daysUntil);
            map.set(key, [...(map.get(key) ?? []), b]);
        }
        return Array.from(map.entries());
    }, [birthdays, rangeDays, search]);

    const todayCount = birthdays.filter((b) => b.daysUntil === 0).length;
    const shownCount = groups.reduce((n, [, list]) => n + list.length, 0);

    return (
        <div className="mx-auto w-full max-w-4xl space-y-6">
            <div>
                <div className="flex items-center gap-2 text-[#34A853]">
                    <Cake className="h-5 w-5" />
                    <span className="text-xs font-bold uppercase tracking-[0.18em]">{scopeLabel}</span>
                </div>
                <h1 className="mt-2 text-2xl font-bold tracking-tight">Birthdays</h1>
                <p className="mt-1 max-w-2xl text-sm text-neutral-500 dark:text-white/50">
                    Upcoming birthdays so you can celebrate your people.
                    {todayCount > 0 && <> <strong className="text-[#34A853]">{todayCount} {todayCount === 1 ? "person celebrates" : "people celebrate"} today.</strong></>}
                </p>
            </div>

            {loadError && (
                <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
                    Birthdays could not be loaded. Please refresh the page.
                </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-2">
                    {RANGES.map((r) => (
                        <button
                            key={r.days}
                            type="button"
                            onClick={() => setRangeDays(r.days)}
                            className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${rangeDays === r.days
                                ? "bg-[#34A853] text-white"
                                : "border border-neutral-200 hover:bg-neutral-100 dark:border-white/10 dark:hover:bg-white/5"}`}
                        >
                            {r.label}
                        </button>
                    ))}
                </div>
                <label className="relative block sm:w-64">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                    <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search name or department"
                        className="w-full rounded-xl border border-neutral-200 bg-white/60 py-2 pl-9 pr-3 text-sm outline-none focus:border-[#34A853] dark:border-white/10 dark:bg-white/[0.03]"
                    />
                </label>
            </div>

            {shownCount === 0 ? (
                <p className="rounded-2xl border border-neutral-200 bg-white/60 py-10 text-center text-sm text-neutral-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/40">
                    No birthdays in this period.
                </p>
            ) : (
                groups.map(([name, list]) => (
                    <section key={name} className="rounded-2xl border border-neutral-200 bg-white/60 p-5 dark:border-white/10 dark:bg-white/[0.03]">
                        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider">{name} ({list.length})</h2>
                        <ul className="divide-y divide-neutral-200 dark:divide-white/5">
                            {list.map((b) => {
                                const initials = `${b.firstName[0] ?? ""}${b.lastName[0] ?? ""}`.toUpperCase() || "W";
                                return (
                                    <li key={b.id} className="flex items-center gap-3 py-3">
                                        <BirthdayAvatar avatarUrl={b.avatarUrl} initials={initials} isToday={b.daysUntil === 0} />
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate font-semibold">{`${b.firstName} ${b.lastName}`.trim()}</p>
                                            <p className="truncate text-xs text-neutral-500 dark:text-white/50">
                                                {b.team ? `${b.team} · ` : ""}{b.department}
                                            </p>
                                        </div>
                                        <div className="shrink-0 text-right">
                                            <p className="text-sm font-semibold">{dateLabel(b.month, b.day)}</p>
                                            <p className={`text-xs ${b.daysUntil === 0 ? "font-bold text-[#34A853]" : "text-neutral-500 dark:text-white/50"}`}>
                                                {whenLabel(b.daysUntil)}
                                            </p>
                                        </div>
                                        {b.phone && (
                                            <a
                                                href={`tel:${b.phone}`}
                                                aria-label={`Call ${b.firstName}`}
                                                className="shrink-0 rounded-lg p-2 text-[#34A853] transition hover:bg-[#34A853]/10"
                                            >
                                                <Phone className="h-4 w-4" />
                                            </a>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                ))
            )}
        </div>
    );
}
