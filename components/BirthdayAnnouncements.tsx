import { CakeSlice } from "lucide-react";
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

export function UpcomingBirthdaysSidebar({
    birthdays,
}: {
    birthdays: UpcomingBirthday[];
}) {
    if (birthdays.length === 0) return null;

    return (
        <section
            aria-labelledby="upcoming-birthdays-heading"
            className="mb-8 rounded-2xl border border-[#34A853]/25 bg-[#34A853]/[0.05] p-4 shadow-sm"
        >
            <div className="mb-3 flex items-center gap-2 text-[#34A853]">
                <CakeSlice className="h-4 w-4" aria-hidden="true" />
                <h2 id="upcoming-birthdays-heading" className="text-[11px] font-bold uppercase tracking-[0.16em]">
                    Upcoming Birthdays
                </h2>
            </div>

            <ul className="space-y-3">
                {birthdays.slice(0, 5).map((birthday, index) => {
                    const name = displayName(birthday);
                    const initials = `${birthday.first_name[0] || ""}${birthday.last_name[0] || ""}`.toUpperCase() || "HB";

                    return (
                        <li
                            key={`${name}-${birthday.next_birthday}-${index}`}
                            className="flex min-w-0 items-center gap-3"
                        >
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#34A853]/25 bg-[#34A853]/10 text-[11px] font-bold text-[#34A853]">
                                {initials}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-1.5">
                                    <p className="truncate text-[13px] font-semibold text-neutral-800 dark:text-white/90">
                                        {name}
                                    </p>
                                    <span className="shrink-0 text-[10px] font-bold text-[#34A853]">
                                        {relativeBirthdayLabel(birthday.days_until)}
                                    </span>
                                </div>
                                <p className="truncate text-[11px] text-neutral-500 dark:text-white/50">
                                    <span className="font-medium text-neutral-700 dark:text-white/70">
                                        {birthday.department_name}
                                    </span>
                                    <span className="mx-1 text-neutral-400 dark:text-white/30">•</span>
                                    <span>{birthdayDateLabel(birthday)}</span>
                                </p>
                            </div>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
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
