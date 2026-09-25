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
            className="mb-8 rounded-2xl border border-fuchsia-500/15 bg-fuchsia-500/[0.06] p-4"
        >
            <div className="mb-3 flex items-center gap-2 text-fuchsia-600 dark:text-fuchsia-300">
                <CakeSlice className="h-4 w-4" aria-hidden="true" />
                <h2 id="upcoming-birthdays-heading" className="text-[11px] font-bold uppercase tracking-[0.16em]">
                    Upcoming Birthdays
                </h2>
            </div>

            <ul className="space-y-2.5">
                {birthdays.slice(0, 5).map((birthday, index) => {
                    const name = displayName(birthday);
                    const initials = `${birthday.first_name[0] || ""}${birthday.last_name[0] || ""}`.toUpperCase() || "HB";

                    return (
                        <li
                            key={`${name}-${birthday.next_birthday}-${index}`}
                            className="flex min-w-0 items-center gap-3"
                        >
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-fuchsia-500/15 bg-fuchsia-500/10 text-[11px] font-bold text-fuchsia-600 dark:text-fuchsia-300">
                                {initials}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-[13px] font-semibold text-neutral-800 dark:text-white/85">
                                    {name}
                                </p>
                                <p className="truncate text-[11px] text-neutral-500 dark:text-white/45">
                                    {birthdayDateLabel(birthday)} · {relativeBirthdayLabel(birthday.days_until)}
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
            className="border-b border-fuchsia-500/15 bg-fuchsia-500/[0.07] px-4 py-2.5 sm:px-6 lg:px-8"
        >
            <div className="mx-auto flex max-w-[1600px] items-center gap-3 text-sm">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-300">
                    <CakeSlice className="h-4 w-4" aria-hidden="true" />
                </span>
                <p className="min-w-0 text-neutral-700 dark:text-white/75">
                    <span className="font-bold text-fuchsia-700 dark:text-fuchsia-300">
                        Upcoming birthday:
                    </span>{" "}
                    <span className="font-semibold">{names}</span>
                    {remaining > 0 ? ` and ${remaining} more` : ""}
                    <span className="text-neutral-500 dark:text-white/45">
                        {` · ${birthdayDateLabel(nextBirthday)} · ${relativeBirthdayLabel(nextBirthday.days_until)} · ${nextBirthday.department_name}`}
                    </span>
                </p>
            </div>
        </section>
    );
}
