import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireAdminAuth } from "@/lib/rbac";
import WorkersClient from "./WorkersClient";

export const metadata = {
    title: "Workers Management | Admin Portal",
};

const WORKERS_PAGE_SIZE = 20;

type WorkerRow = {
    id: string;
    first_name: string;
    last_name: string;
    department: string;
    department_id: string | null;
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
    const { isSuperAdmin, isTeamAdmin, managedDepartmentIds } = await requireAdminAuth();

    const searchParams = await props.searchParams;
    const parsedPage = typeof searchParams.page === 'string' ? parseInt(searchParams.page, 10) : 1;
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const search = typeof searchParams.search === 'string' ? searchParams.search : '';
    const department = typeof searchParams.department === 'string' ? searchParams.department : 'all';

    const supabase = await createClient();

    const sanitizedSearch = search.replace(/[,()]/g, ' ').trim();

    let query = supabase
        .from('profiles')
        .select('id, first_name, last_name, department, department_id, role, avatar_url, created_at, worker_id, phone, date_of_birth', { count: 'exact' });

    // Zero-Trust Scope Isolation: If Department Head, restrict to managed department(s)
    if (!isSuperAdmin) {
        query = query.in('department_id', managedDepartmentIds);
    }

    if (sanitizedSearch) {
        query = query.or(`first_name.ilike.%${sanitizedSearch}%,last_name.ilike.%${sanitizedSearch}%,department.ilike.%${sanitizedSearch}%,worker_id.ilike.%${sanitizedSearch}%`);
    }

    if (department !== 'all') {
        query = query.eq('department_id', department);
    }

    // Apply pagination
    const from = (page - 1) * WORKERS_PAGE_SIZE;
    const to = from + WORKERS_PAGE_SIZE - 1;

    // Parallelize all independent DB queries to eliminate server waterfalls
    const [departmentsRes, workersRes, activeSessionsRes, teamsRes] = await Promise.all([
        supabase
            .from('departments')
            .select('id, name, is_active, head_user_id')
            .order('name', { ascending: true }),
        query
            .order('created_at', { ascending: false })
            .range(from, to),
        supabase
            .from('attendance_sessions')
            .select('id, event:events(title)')
            .eq('status', 'active'),
        isSuperAdmin
            ? supabase
                .from('teams')
                .select('id, name, code, is_active')
                .eq('is_active', true)
                .order('name', { ascending: true })
            : Promise.resolve({ data: [] as TeamRow[], error: null }),
    ]);

    if (departmentsRes.error) {
        console.error("Error fetching departments:", departmentsRes.error);
    }

    let rawDepartments = departmentsRes.data || [];
    // Filter department dropdown options for Department Heads
    if (!isSuperAdmin) {
        rawDepartments = rawDepartments.filter((d) => managedDepartmentIds.includes(d.id));
    }

    const selectedDepartment = rawDepartments.some((dept) => dept.id === department) ? department : 'all';

    let workers = (workersRes.data || []) as WorkerRow[];
    let count = workersRes.count;
    let error = workersRes.error;

    // Fallback for worker_id column if needed
    if (error && (error.code === '42703' || error.message?.toLowerCase().includes('worker_id'))) {
        let fallbackQuery = supabase
            .from('profiles')
            .select('id, first_name, last_name, department, department_id, role, avatar_url, created_at, phone, date_of_birth', { count: 'exact' });

        if (!isSuperAdmin) {
            fallbackQuery = fallbackQuery.in('department_id', managedDepartmentIds);
        }

        if (sanitizedSearch) {
            fallbackQuery = fallbackQuery.or(`first_name.ilike.%${sanitizedSearch}%,last_name.ilike.%${sanitizedSearch}%,department.ilike.%${sanitizedSearch}%`);
        }
        if (department !== 'all') {
            fallbackQuery = fallbackQuery.eq('department_id', department);
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
        rawDepartments
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
            selectedDepartment={selectedDepartment}
            departments={rawDepartments}
            teams={(teamsRes.data || []) as TeamRow[]}
            pageSize={WORKERS_PAGE_SIZE}
            activeSessions={formattedActiveSessions}
            isSuperAdmin={isSuperAdmin}
            canManageDepartmentHeads={isSuperAdmin || isTeamAdmin}
        />
    );
}
