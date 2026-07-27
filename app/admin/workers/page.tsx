import { createClient } from "@/utils/supabase/server";
import WorkersClient from "./WorkersClient";

export const metadata = {
    title: "Workers Management | Admin Portal",
};

const WORKERS_PAGE_SIZE = 20;

export default async function WorkersPage(props: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
    const searchParams = await props.searchParams;
    const parsedPage = typeof searchParams.page === 'string' ? parseInt(searchParams.page, 10) : 1;
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const search = typeof searchParams.search === 'string' ? searchParams.search : '';
    const department = typeof searchParams.department === 'string' ? searchParams.department : 'all';

    const supabase = await createClient();

    
    const sanitizedSearch = search.replace(/[,()]/g, ' ').trim();

    
    let query = supabase
        .from('profiles')
        .select('id, first_name, last_name, department, department_id, role, avatar_url, created_at, worker_id', { count: 'exact' });

    if (sanitizedSearch) {
        query = query.or(`first_name.ilike.%${sanitizedSearch}%,last_name.ilike.%${sanitizedSearch}%,department.ilike.%${sanitizedSearch}%,worker_id.ilike.%${sanitizedSearch}%`);
    }

    if (department !== 'all') {
        query = query.eq('department_id', department);
    }

    // Apply pagination
    const from = (page - 1) * WORKERS_PAGE_SIZE;
    const to = from + WORKERS_PAGE_SIZE - 1;

    // Parallelize all independent DB queries to eliminate server waterfalls and maximize response speed
    const [departmentsRes, workersRes, activeSessionsRes] = await Promise.all([
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
    ]);

    if (departmentsRes.error) {
        console.error("Error fetching departments:", departmentsRes.error);
    }

    const departmentOptions = departmentsRes.data || [];
    const selectedDepartment = departmentOptions.some((dept) => dept.id === department) ? department : 'all';

    let workers = workersRes.data;
    let count = workersRes.count;
    let error = workersRes.error;

    // Robust production fallback: If worker_id column does not exist yet, fallback to standard selection
    if (error && (error.code === '42703' || error.message?.toLowerCase().includes('worker_id'))) {
        let fallbackQuery = supabase
            .from('profiles')
            .select('id, first_name, last_name, department, department_id, role, avatar_url, created_at', { count: 'exact' });

        if (sanitizedSearch) {
            fallbackQuery = fallbackQuery.or(`first_name.ilike.%${sanitizedSearch}%,last_name.ilike.%${sanitizedSearch}%,department.ilike.%${sanitizedSearch}%`);
        }
        if (department !== 'all') {
            fallbackQuery = fallbackQuery.eq('department_id', department);
        }

        const fallbackRes = await fallbackQuery
            .order('created_at', { ascending: false })
            .range(from, to);

        workers = (fallbackRes.data || []).map((w: any) => ({ ...w, worker_id: null }));
        count = fallbackRes.count;
        error = fallbackRes.error;
    }

    if (error) {
        console.error("Error fetching workers:", error);
    }

    const headByUserId = new Map(
        departmentOptions
            .filter((dept: any) => dept.head_user_id)
            .map((dept: any) => [dept.head_user_id as string, { id: dept.id, name: dept.name }])
    );

    const formattedWorkers = (workers || []).map((worker) => {
        const headDepartment = headByUserId.get(worker.id);

        return {
            ...worker,
            head_department_id: headDepartment?.id || null,
            head_department_name: headDepartment?.name || null,
        };
    });

    const formattedActiveSessions = (activeSessionsRes.data || []).map((s: any) => ({
        id: s.id as string,
        title: (Array.isArray(s.event) ? s.event[0]?.title : s.event?.title) || "Active Session",
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
            departments={departmentOptions}
            pageSize={WORKERS_PAGE_SIZE}
            activeSessions={formattedActiveSessions}
        />
    );
}
