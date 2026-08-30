import { NextRequest, NextResponse } from "next/server";
import { requireAdminManagementAuth } from "@/lib/rbac";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

const PAGE_SIZE = 1000;
const AUTH_PAGE_SIZE = 1000;
const MAX_AUTH_PAGES = 100;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROLE_FILTERS = ["worker", "admin", "team_admin", "reports_admin"] as const;
const HEAD_FILTERS = ["heads", "non_heads"] as const;
const BIRTHDAY_FILTERS = ["today", "next_7_days", "this_month", "missing"] as const;
const WORKER_DIRECTORY_TIME_ZONE = "Africa/Lagos";

function isRoleFilter(value: string): value is typeof ROLE_FILTERS[number] {
    return ROLE_FILTERS.includes(value as typeof ROLE_FILTERS[number]);
}

function isHeadFilter(value: string): value is typeof HEAD_FILTERS[number] {
    return HEAD_FILTERS.includes(value as typeof HEAD_FILTERS[number]);
}

function isBirthdayFilter(value: string): value is typeof BIRTHDAY_FILTERS[number] {
    return BIRTHDAY_FILTERS.includes(value as typeof BIRTHDAY_FILTERS[number]);
}

function getZonedDateParts(offsetDays = 0) {
    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: WORKER_DIRECTORY_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    });
    const parts = formatter.formatToParts(new Date());
    const year = Number(parts.find((part) => part.type === "year")?.value);
    const month = Number(parts.find((part) => part.type === "month")?.value);
    const day = Number(parts.find((part) => part.type === "day")?.value);
    const zonedDate = new Date(Date.UTC(year, month - 1, day + offsetDays));

    return {
        month: zonedDate.getUTCMonth() + 1,
        day: zonedDate.getUTCDate(),
    };
}

function getUpcomingBirthdayClauses(days: number) {
    const uniqueDays = new Set<string>();

    for (let offset = 0; offset < days; offset += 1) {
        const dateParts = getZonedDateParts(offset);
        uniqueDays.add(`and(birthday_month.eq.${dateParts.month},birthday_day.eq.${dateParts.day})`);
    }

    return Array.from(uniqueDays).join(",");
}

type WorkerExportRow = {
    id: string;
    worker_id: string | null;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    team: string | null;
    department: string | null;
    role: string | null;
    date_of_birth: string | null;
    created_at: string | null;
};

function escapeCSVValue(value: unknown): string {
    if (value === null || value === undefined) return "\"\"";
    let str = String(value);

    // Prevent CSV formula injection when opened in spreadsheet tools.
    if (/^[\t\r\n\0]/.test(str) || /^\s*[=+\-@]/.test(str)) {
        str = `'${str}`;
    }

    return `"${str.replace(/"/g, '""')}"`;
}

function formatDate(value: string | null) {
    if (!value) return "";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toISOString().slice(0, 10);
}

function getRoleLabel(role: string | null) {
    if (role === "admin" || role === "super_admin") return "Super Admin";
    if (role === "team_admin") return "Team Admin";
    if (role === "reports_admin") return "Reports Only Admin";
    return "Worker";
}

function getRoleFilterLabel(role: string) {
    if (role === "admin") return "admins";
    if (role === "team_admin") return "team-admins";
    if (role === "reports_admin") return "reports-admins";
    return "workers";
}

function toSafeFilenamePart(value: string) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48) || "department";
}

async function buildAuthEmailMap(workerIds: Set<string>) {
    const emailMap = new Map<string, string>();
    if (workerIds.size === 0) return emailMap;

    const adminSupabase = createAdminClient();
    for (let page = 1; page <= MAX_AUTH_PAGES && emailMap.size < workerIds.size; page += 1) {
        const { data, error } = await adminSupabase.auth.admin.listUsers({
            page,
            perPage: AUTH_PAGE_SIZE,
        });

        if (error) {
            console.error("[WorkersExport] Failed to fetch auth users:", error);
            break;
        }

        const users = data?.users || [];
        for (const user of users) {
            if (workerIds.has(user.id) && user.email) {
                emailMap.set(user.id, user.email);
            }
        }

        if (users.length < AUTH_PAGE_SIZE) break;
    }

    return emailMap;
}

export async function GET(request: NextRequest) {
    const scope = await requireAdminManagementAuth();
    const supabase = await createClient();

    try {
        const teamParam = request.nextUrl.searchParams.get("team");
        const departmentParam = request.nextUrl.searchParams.get("department");
        const roleParam = request.nextUrl.searchParams.get("role");
        const headParam = request.nextUrl.searchParams.get("head");
        const birthdayParam = request.nextUrl.searchParams.get("birthday");
        const requestedTeamId = teamParam && teamParam !== "all" ? teamParam : null;
        const requestedDepartmentId = departmentParam && departmentParam !== "all" ? departmentParam : null;
        const requestedRole = roleParam && roleParam !== "all" ? roleParam : null;
        const requestedHead = headParam && headParam !== "all" ? headParam : null;
        const requestedBirthday = birthdayParam && birthdayParam !== "all" ? birthdayParam : null;
        let selectedTeamName: string | null = null;
        let selectedDepartmentName: string | null = null;

        if (requestedTeamId && !UUID_REGEX.test(requestedTeamId)) {
            return NextResponse.json({ error: "Invalid team selected." }, { status: 400 });
        }

        if (requestedDepartmentId && !UUID_REGEX.test(requestedDepartmentId)) {
            return NextResponse.json({ error: "Invalid department selected." }, { status: 400 });
        }

        if (requestedRole && !isRoleFilter(requestedRole)) {
            return NextResponse.json({ error: "Invalid role selected." }, { status: 400 });
        }

        if (requestedHead && !isHeadFilter(requestedHead)) {
            return NextResponse.json({ error: "Invalid department-head filter selected." }, { status: 400 });
        }

        if (requestedBirthday && !isBirthdayFilter(requestedBirthday)) {
            return NextResponse.json({ error: "Invalid birthday filter selected." }, { status: 400 });
        }

        if (requestedTeamId) {
            if (!scope.isSuperAdmin && !scope.managedTeamIds.includes(requestedTeamId)) {
                return NextResponse.json({ error: "Forbidden: You cannot export workers for this team." }, { status: 403 });
            }

            const { data: team, error: teamError } = await supabase
                .from("teams")
                .select("id, name")
                .eq("id", requestedTeamId)
                .eq("is_active", true)
                .maybeSingle();

            if (teamError) {
                console.error("[WorkersExport] Failed to validate team:", teamError);
                return NextResponse.json({ error: "Failed to validate team." }, { status: 500 });
            }

            if (!team) {
                return NextResponse.json({ error: "Selected team was not found." }, { status: 404 });
            }

            selectedTeamName = team.name;
        }

        if (requestedDepartmentId) {
            if (!scope.isSuperAdmin && !scope.managedDepartmentIds.includes(requestedDepartmentId)) {
                return NextResponse.json({ error: "Forbidden: You cannot export workers for this department." }, { status: 403 });
            }

            const { data: department, error: departmentError } = await supabase
                .from("departments")
                .select("id, name, team_id")
                .eq("id", requestedDepartmentId)
                .eq("is_active", true)
                .maybeSingle();

            if (departmentError) {
                console.error("[WorkersExport] Failed to validate department:", departmentError);
                return NextResponse.json({ error: "Failed to validate department." }, { status: 500 });
            }

            if (!department) {
                return NextResponse.json({ error: "Selected department was not found." }, { status: 404 });
            }

            if (requestedTeamId && department.team_id !== requestedTeamId) {
                return NextResponse.json({ error: "Selected department does not belong to the selected team." }, { status: 400 });
            }

            selectedDepartmentName = department.name;
        }

        let headDepartmentsQuery = supabase
            .from("departments")
            .select("head_user_id")
            .eq("is_active", true)
            .not("head_user_id", "is", null);

        if (requestedDepartmentId) {
            headDepartmentsQuery = headDepartmentsQuery.eq("id", requestedDepartmentId);
        } else if (requestedTeamId) {
            headDepartmentsQuery = headDepartmentsQuery.eq("team_id", requestedTeamId);
        } else if (!scope.isSuperAdmin) {
            if (scope.managedDepartmentIds.length === 0) {
                headDepartmentsQuery = headDepartmentsQuery.eq("id", "00000000-0000-0000-0000-000000000000");
            } else {
                headDepartmentsQuery = headDepartmentsQuery.in("id", scope.managedDepartmentIds);
            }
        }

        const { data: headDepartments, error: headDepartmentsError } = await headDepartmentsQuery;
        if (headDepartmentsError) {
            console.error("[WorkersExport] Failed to fetch department-head scope:", headDepartmentsError);
            return NextResponse.json({ error: "Failed to validate department-head filter." }, { status: 500 });
        }

        const departmentHeadUserIds = (headDepartments || [])
            .map((department) => department.head_user_id)
            .filter((headUserId): headUserId is string => Boolean(headUserId));

        const workerRows: WorkerExportRow[] = [];
        let offset = 0;
        let hasMore = true;

        while (hasMore) {
            let query = supabase
                .from("profiles")
                .select("id, worker_id, first_name, last_name, phone, team, department, role, date_of_birth, created_at")
                .eq("is_active", true)
                .order("created_at", { ascending: false })
                .range(offset, offset + PAGE_SIZE - 1);

            if (requestedDepartmentId) {
                query = query.eq("department_id", requestedDepartmentId);
            } else if (requestedTeamId) {
                query = query.eq("team_id", requestedTeamId);
            } else if (!scope.isSuperAdmin) {
                if (scope.managedDepartmentIds.length === 0) {
                    hasMore = false;
                    break;
                }
                query = query.in("department_id", scope.managedDepartmentIds);
            }

            if (requestedRole === "admin") {
                query = query.in("role", ["admin", "super_admin"]);
            } else if (requestedRole) {
                query = query.eq("role", requestedRole);
            }

            if (requestedHead === "heads") {
                query = departmentHeadUserIds.length > 0
                    ? query.in("id", departmentHeadUserIds)
                    : query.eq("id", "00000000-0000-0000-0000-000000000000");
            } else if (requestedHead === "non_heads" && departmentHeadUserIds.length > 0) {
                query = query.not("id", "in", `(${departmentHeadUserIds.join(",")})`);
            }

            if (requestedBirthday === "missing") {
                query = query.is("date_of_birth", null);
            } else if (requestedBirthday === "today") {
                const today = getZonedDateParts();
                query = query.eq("birthday_month", today.month).eq("birthday_day", today.day);
            } else if (requestedBirthday === "this_month") {
                query = query.eq("birthday_month", getZonedDateParts().month);
            } else if (requestedBirthday === "next_7_days") {
                query = query.or(getUpcomingBirthdayClauses(7));
            }

            const { data, error } = await query;
            if (error) {
                console.error("[WorkersExport] Failed to fetch workers:", error);
                return NextResponse.json({ error: "Failed to export workers." }, { status: 500 });
            }

            const rows = (data || []) as WorkerExportRow[];
            workerRows.push(...rows);

            if (rows.length < PAGE_SIZE) {
                hasMore = false;
            } else {
                offset += PAGE_SIZE;
            }
        }

        const workerIds = new Set(workerRows.map((worker) => worker.id));
        const emailMap = await buildAuthEmailMap(workerIds);

        const headers = [
            "Worker ID",
            "First Name",
            "Last Name",
            "Email",
            "Phone",
            "Team",
            "Department",
            "Role",
            "Birthday",
            "Registered On",
        ];

        const rows = workerRows.map((worker) => [
            worker.worker_id,
            worker.first_name,
            worker.last_name,
            emailMap.get(worker.id) || "",
            worker.phone,
            worker.team,
            worker.department,
            getRoleLabel(worker.role),
            worker.date_of_birth,
            formatDate(worker.created_at),
        ]);

        const csv = [
            headers.map(escapeCSVValue).join(","),
            ...rows.map((row) => row.map(escapeCSVValue).join(",")),
        ].join("\n");

        const dateSuffix = new Date().toISOString().slice(0, 10);
        const filenameScope = selectedDepartmentName
            ? `-${toSafeFilenamePart(selectedDepartmentName)}`
            : selectedTeamName
                ? `-${toSafeFilenamePart(selectedTeamName)}`
                : "";
        const filenameRole = requestedRole ? `-${getRoleFilterLabel(requestedRole)}` : "";
        const filenameHead = requestedHead ? `-${toSafeFilenamePart(requestedHead)}` : "";
        const filenameBirthday = requestedBirthday ? `-${toSafeFilenamePart(requestedBirthday)}` : "";

        return new NextResponse(csv, {
            status: 200,
            headers: {
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition": `attachment; filename="workers${filenameScope}${filenameRole}${filenameHead}${filenameBirthday}-${dateSuffix}.csv"`,
                "Cache-Control": "no-store",
            },
        });
    } catch (error) {
        console.error("[WorkersExport] Unexpected export failure:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
