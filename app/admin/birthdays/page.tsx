import { requireAdminManagementAuth } from "@/lib/rbac";
import { createAdminClient } from "@/utils/supabase/admin";
import BirthdaysClient, { type AdminBirthday } from "./BirthdaysClient";

export const metadata = {
    title: "Birthdays | Admin Portal",
};
export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Today's date in Lagos as a UTC-midnight timestamp, so day maths ignores time zones. */
function lagosToday(): number {
    const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" })
        .format(new Date())
        .split("-")
        .map(Number);
    return Date.UTC(y, m - 1, d);
}

function isLeapYear(year: number) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Next birthday on or after today. 29 Feb birthdays fall on 28 Feb in non-leap years. */
function nextBirthday(month: number, day: number, today: number): number {
    const thisYear = new Date(today).getUTCFullYear();
    for (const year of [thisYear, thisYear + 1]) {
        const d = month === 2 && day === 29 && !isLeapYear(year) ? 28 : day;
        const date = Date.UTC(year, month - 1, d);
        if (date >= today) return date;
    }
    return today;
}

export default async function AdminBirthdaysPage() {
    // Admins see everyone; team admins see their team; department heads see only their department(s).
    const scope = await requireAdminManagementAuth();
    const admin = createAdminClient();

    let query = admin
        .from("profiles")
        .select("id, first_name, last_name, avatar_url, phone, department, team, birthday_month, birthday_day")
        .eq("is_active", true)
        .not("birthday_month", "is", null)
        .not("birthday_day", "is", null);

    if (!scope.isSuperAdmin) {
        // The scope check runs on the server, so no one can widen it from the browser.
        query = query.in("department_id", scope.managedDepartmentIds.length ? scope.managedDepartmentIds : ["00000000-0000-0000-0000-000000000000"]);
    }

    const { data, error } = await query;
    const today = lagosToday();

    const birthdays: AdminBirthday[] = (data ?? [])
        .map((p) => {
            const next = nextBirthday(p.birthday_month, p.birthday_day, today);
            return {
                id: p.id,
                firstName: p.first_name ?? "Worker",
                lastName: p.last_name ?? "",
                avatarUrl: p.avatar_url ?? null,
                phone: p.phone ?? null,
                department: p.department ?? "Unassigned",
                team: p.team ?? null,
                month: p.birthday_month,
                day: p.birthday_day,
                daysUntil: Math.round((next - today) / DAY_MS),
            };
        })
        .sort((a, b) => a.daysUntil - b.daysUntil || a.firstName.localeCompare(b.firstName));

    const scopeLabel = scope.isSuperAdmin
        ? "Everyone in the workforce"
        : scope.isTeamAdmin
            ? `Your team: ${scope.managedTeams.map((t) => t.name).join(", ")}`
            : `Your department: ${scope.managedDepartments.map((d) => d.name).join(", ")}`;

    return <BirthdaysClient birthdays={birthdays} scopeLabel={scopeLabel} loadError={!!error} />;
}
