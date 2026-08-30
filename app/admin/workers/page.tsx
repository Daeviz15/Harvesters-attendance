import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireAdminManagementAuth } from "@/lib/rbac";
import { canManageWorkerAccess } from "@/lib/admin-permissions";
import WorkersClient from "./WorkersClient";

export const metadata = {
    title: "Workers Management | Admin Portal",
};

const WORKERS_PAGE_SIZE = 20;
const WORKER_ROLE_FILTERS = ["worker", "admin", "team_admin", "reports_admin"] as const;
const HEAD_FILTERS = ["heads", "non_heads"] as const;
const BIRTHDAY_FILTERS = ["today", "next_7_days", "this_month", "missing"] as const;
const WORKER_DIRECTORY_TIME_ZONE = "Africa/Lagos";

function isWorkerRoleFilter(value: string): value is typeof WORKER_ROLE_FILTERS[number] {
    return WORKER_ROLE_FILTERS.includes(value as typeof WORKER_ROLE_FILTERS[number]);
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

type WorkerRow = {
    id: string;
    first_name: string;
    last_name: string;
    department: string;
    department_id: string | null;
    team_id: string | null;
    team: string | null;
    role: string;
    avatar_url: string | null;
    created_at: string;
    worker_id: string | null;
    phone: string | null;
    date_of_birth: string | null;
    team_admin_team_id?: string | null;
    team_admin_team_name?: string | null;
};

type DepartmentRow = {
    id: string;
    name: string;
    team_id: string | null;
    team: string | null;
    is_active: boolean;
    head_user_id: string | null;
};

type TeamRow = {
    id: string;
    name: string;
    code: string | null;
    is_active: boolean;
};

type ActiveSessionRow = {
    id: string;
    event: { title: string } | { title: string }[] | null;
};

export default async function WorkersPage(props: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
    // Zero-Trust Server-Side RBAC Scope Retrieval
    const { isSuperAdmin, isTeamAdmin, managedDepartmentIds } = await requireAdminManagementAuth();

    const searchParams = await props.searchParams;
    const parsedPage = typeof searchParams.page === 'string' ? parseInt(searchParams.page, 10) : 1;
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const search = typeof searchParams.search === 'string' ? searchParams.search : '';
    const team = typeof searchParams.team === 'string' ? searchParams.team : 'all';
    const department = typeof searchParams.department === 'string' ? searchParams.department : 'all';
    const role = typeof searchParams.role === 'string' ? searchParams.role : 'all';
    const selectedRole = isWorkerRoleFilter(role) ? role : 'all';
    const head = typeof searchParams.head === 'string' ? searchParams.head : 'all';
    const selectedHead = isHeadFilter(head) ? head : 'all';
    const birthday = typeof searchParams.birthday === 'string' ? searchParams.birthday : 'all';
    const selectedBirthday = isBirthdayFilter(birthday) ? birthday : 'all';

    const supabase = await createClient();

    const sanitizedSearch = search.replace(/[,()]/g, ' ').trim();

    const [departmentsRes, activeSessionsRes, teamsRes] = await Promise.all([
        supabase
            .from('departments')
            .select('id, name, team, team_id, is_active, head_user_id')
            .order('name', { ascending: true }),
        supabase
            .from('attendance_sessions')
            .select('id, event:events(title)')
            .eq('status', 'active'),
        isSuperAdmin || isTeamAdmin
            ? supabase
                .from('teams')
                .select('id, name, code, is_active')
                .eq('is_active', true)
                .order('name', { ascending: true })
            : Promise.resolve({ data: [] as TeamRow[], error: null }),
    ]);

    let departmentsError = departmentsRes.error;
    let departmentRows = (departmentsRes.data || []) as DepartmentRow[];

    if (departmentsRes.error && departmentsRes.error.code === "42703") {
        const fallbackDepartmentsRes = await supabase
            .from('departments')
            .select('id, name, team, team_id, is_active')
            .order('name', { ascending: true });

        departmentsError = fallbackDepartmentsRes.error;
        departmentRows = (fallbackDepartmentsRes.data || []).map((departmentRow) => ({
            ...departmentRow,
            head_user_id: null,
        })) as DepartmentRow[];
    }

    if (departmentsError) {
        console.error("Error fetching departments:", {
            message: departmentsError.message,
            details: departmentsError.details,
            hint: departmentsError.hint,
            code: departmentsError.code,
        });
    }

    if (teamsRes.error) {
        console.error("Error fetching teams:", teamsRes.error);
    }

    let allDepartments = departmentRows;
    let accessibleTeams = ((teamsRes.data || []) as TeamRow[]);

    if (!isSuperAdmin) {
        allDepartments = allDepartments.filter((departmentRow) => managedDepartmentIds.includes(departmentRow.id));
        const accessibleTeamIds = new Set(allDepartments.map((departmentRow) => departmentRow.team_id).filter(Boolean));
        accessibleTeams = accessibleTeams.filter((teamRow) => accessibleTeamIds.has(teamRow.id));
    }

    const activeDepartments = allDepartments.filter((departmentRow) => departmentRow.is_active);
    const selectedTeam = accessibleTeams.some((teamRow) => teamRow.id === team) ? team : 'all';
    const departmentsForSelectedTeam = selectedTeam === 'all'
        ? activeDepartments
        : activeDepartments.filter((departmentRow) => departmentRow.team_id === selectedTeam);
    const selectedDepartment = departmentsForSelectedTeam.some((dept) => dept.id === department) ? department : 'all';
    const selectedDepartmentIds = selectedDepartment === 'all'
        ? departmentsForSelectedTeam.map((dept) => dept.id)
        : [selectedDepartment];

    let query = supabase
        .from('profiles')
        .select('id, first_name, last_name, department, department_id, team_id, team, role, avatar_url, created_at, worker_id, phone, date_of_birth', { count: 'exact' })
        .eq('is_active', true);

    if (!isSuperAdmin) {
        query = query.in('department_id', managedDepartmentIds);
    }

    if (selectedDepartment !== 'all') {
        query = query.eq('department_id', selectedDepartment);
    } else if (selectedTeam !== 'all') {
        if (selectedDepartmentIds.length > 0) {
            query = query.in('department_id', selectedDepartmentIds);
        } else {
            query = query.eq('team_id', selectedTeam);
        }
    }

    if (selectedRole === 'admin') {
        query = query.in('role', ['admin', 'super_admin']);
    } else if (selectedRole !== 'all') {
        query = query.eq('role', selectedRole);
    }

    const departmentHeadUserIds = allDepartments
        .map((departmentRow) => departmentRow.head_user_id)
        .filter((headUserId): headUserId is string => Boolean(headUserId));

    if (selectedHead === 'heads') {
        query = departmentHeadUserIds.length > 0
            ? query.in('id', departmentHeadUserIds)
            : query.eq('id', '00000000-0000-0000-0000-000000000000');
    } else if (selectedHead === 'non_heads' && departmentHeadUserIds.length > 0) {
        query = query.not('id', 'in', `(${departmentHeadUserIds.join(',')})`);
    }

    if (selectedBirthday === 'missing') {
        query = query.is('date_of_birth', null);
    } else if (selectedBirthday === 'today') {
        const today = getZonedDateParts();
        query = query.eq('birthday_month', today.month).eq('birthday_day', today.day);
    } else if (selectedBirthday === 'this_month') {
        query = query.eq('birthday_month', getZonedDateParts().month);
    } else if (selectedBirthday === 'next_7_days') {
        query = query.or(getUpcomingBirthdayClauses(7));
    }

    if (sanitizedSearch) {
        query = query.or(`first_name.ilike.%${sanitizedSearch}%,last_name.ilike.%${sanitizedSearch}%,department.ilike.%${sanitizedSearch}%,team.ilike.%${sanitizedSearch}%,worker_id.ilike.%${sanitizedSearch}%`);
    }

    const from = (page - 1) * WORKERS_PAGE_SIZE;
    const to = from + WORKERS_PAGE_SIZE - 1;

    const workersRes = await query
        .order('created_at', { ascending: false })
        .range(from, to);

    let workers = (workersRes.data || []) as WorkerRow[];
    let count = workersRes.count;
    let error = workersRes.error;

    // Fallback for worker_id column if needed
    if (error && (error.code === '42703' || error.message?.toLowerCase().includes('worker_id'))) {
        let fallbackQuery = supabase
            .from('profiles')
            .select('id, first_name, last_name, department, department_id, team_id, team, role, avatar_url, created_at, phone, date_of_birth', { count: 'exact' })
            .eq('is_active', true);

        if (!isSuperAdmin) {
            fallbackQuery = fallbackQuery.in('department_id', managedDepartmentIds);
        }

        if (selectedDepartment !== 'all') {
            fallbackQuery = fallbackQuery.eq('department_id', selectedDepartment);
        } else if (selectedTeam !== 'all') {
            if (selectedDepartmentIds.length > 0) {
                fallbackQuery = fallbackQuery.in('department_id', selectedDepartmentIds);
            } else {
                fallbackQuery = fallbackQuery.eq('team_id', selectedTeam);
            }
        }

        if (selectedRole === 'admin') {
            fallbackQuery = fallbackQuery.in('role', ['admin', 'super_admin']);
        } else if (selectedRole !== 'all') {
            fallbackQuery = fallbackQuery.eq('role', selectedRole);
        }

        if (selectedHead === 'heads') {
            fallbackQuery = departmentHeadUserIds.length > 0
                ? fallbackQuery.in('id', departmentHeadUserIds)
                : fallbackQuery.eq('id', '00000000-0000-0000-0000-000000000000');
        } else if (selectedHead === 'non_heads' && departmentHeadUserIds.length > 0) {
            fallbackQuery = fallbackQuery.not('id', 'in', `(${departmentHeadUserIds.join(',')})`);
        }

        if (selectedBirthday === 'missing') {
            fallbackQuery = fallbackQuery.is('date_of_birth', null);
        } else if (selectedBirthday === 'today') {
            const today = getZonedDateParts();
            fallbackQuery = fallbackQuery.eq('birthday_month', today.month).eq('birthday_day', today.day);
        } else if (selectedBirthday === 'this_month') {
            fallbackQuery = fallbackQuery.eq('birthday_month', getZonedDateParts().month);
        } else if (selectedBirthday === 'next_7_days') {
            fallbackQuery = fallbackQuery.or(getUpcomingBirthdayClauses(7));
        }

        if (sanitizedSearch) {
            fallbackQuery = fallbackQuery.or(`first_name.ilike.%${sanitizedSearch}%,last_name.ilike.%${sanitizedSearch}%,department.ilike.%${sanitizedSearch}%,team.ilike.%${sanitizedSearch}%`);
        }

        const fallbackRes = await fallbackQuery
            .order('created_at', { ascending: false })
            .range(from, to);

        workers = ((fallbackRes.data || []) as Omit<WorkerRow, "worker_id">[]).map((worker) => ({ ...worker, worker_id: null }));
        count = fallbackRes.count;
        error = fallbackRes.error;
    }

    if (error) {
        console.error("Error fetching workers:", error);
    }

    const headByUserId = new Map(
        allDepartments
            .filter((dept: DepartmentRow) => dept.head_user_id)
            .map((dept: DepartmentRow) => [dept.head_user_id as string, { id: dept.id, name: dept.name }])
    );

    // Batch-fetch emails from auth.admin for all worker IDs on the page
    const workerIds = (workers || []).map((w) => w.id);
    const emailMap = new Map<string, string>();
    const teamAdminAssignmentMap = new Map<string, { teamId: string; teamName: string }>();
    if (workerIds.length > 0) {
        try {
            const adminSupabase = createAdminClient();
            const [userResults, assignmentsRes] = await Promise.all([
                Promise.all(workerIds.map((id) => adminSupabase.auth.admin.getUserById(id))),
                adminSupabase
                    .from('team_admin_assignments')
                    .select('user_id, team_id, team:teams(name)')
                    .in('user_id', workerIds),
            ]);
            for (const res of userResults) {
                if (res.data?.user?.id && res.data.user.email) {
                    emailMap.set(res.data.user.id, res.data.user.email);
                }
            }
            if (assignmentsRes.data) {
                for (const assignment of assignmentsRes.data) {
                    const team = Array.isArray(assignment.team) ? assignment.team[0] : assignment.team;
                    teamAdminAssignmentMap.set(assignment.user_id, {
                        teamId: assignment.team_id,
                        teamName: team?.name || "Assigned Team",
                    });
                }
            }
        } catch (e) {
            console.error("Error fetching auth emails:", e);
        }
    }

    const formattedWorkers = (workers || []).map((worker) => {
        const headDepartment = headByUserId.get(worker.id);

        return {
            ...worker,
            email: emailMap.get(worker.id) || null,
            head_department_id: headDepartment?.id || null,
            head_department_name: headDepartment?.name || null,
            team_admin_team_id: teamAdminAssignmentMap.get(worker.id)?.teamId || null,
            team_admin_team_name: teamAdminAssignmentMap.get(worker.id)?.teamName || null,
        };
    });

    const formattedActiveSessions = ((activeSessionsRes.data || []) as ActiveSessionRow[]).map((session) => ({
        id: session.id,
        title: (Array.isArray(session.event) ? session.event[0]?.title : session.event?.title) || "Active Session",
    }));

    const totalPages = count ? Math.ceil(count / WORKERS_PAGE_SIZE) : 1;

    return (
        <WorkersClient 
            workers={formattedWorkers} 
            currentPage={page} 
            totalPages={totalPages} 
            totalCount={count || 0}
            initialSearch={search}
            selectedTeam={selectedTeam}
            selectedDepartment={selectedDepartment}
            selectedRole={selectedRole}
            selectedHead={selectedHead}
            selectedBirthday={selectedBirthday}
            departments={allDepartments}
            teams={accessibleTeams}
            pageSize={WORKERS_PAGE_SIZE}
            activeSessions={formattedActiveSessions}
            isSuperAdmin={isSuperAdmin}
            canManageDepartmentHeads={isSuperAdmin || isTeamAdmin}
            canManageWorkerAccess={canManageWorkerAccess({ isSuperAdmin, isTeamAdmin })}
        />
    );
}
