import { createClient } from "@/utils/supabase/server";
import WorkersClient from "./WorkersClient";

export const metadata = {
    title: "Workers Management | Admin Portal",
};

const WORKERS_PAGE_SIZE = 20;

// Next.js 15 requires searchParams to be a Promise.
// We are using Next.js 15 semantics here for future-proofing and type safety.
export default async function WorkersPage(props: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
    const searchParams = await props.searchParams;
    const parsedPage = typeof searchParams.page === 'string' ? parseInt(searchParams.page, 10) : 1;
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const search = typeof searchParams.search === 'string' ? searchParams.search : '';
    const department = typeof searchParams.department === 'string' ? searchParams.department : 'all';

    const supabase = await createClient();

    // The layout.tsx already ensures the user is an admin.
    // However, it's a good practice to explicitly query with the admin client.
    
    const { data: departments, error: departmentsError } = await supabase
        .from('departments')
        .select('id, name, is_active, head_user_id')
        .order('name', { ascending: true });

    if (departmentsError) {
        console.error("Error fetching departments:", departmentsError);
    }

    const departmentOptions = departments || [];
    const selectedDepartment = departmentOptions.some((dept) => dept.id === department) ? department : 'all';

    let query = supabase
        .from('profiles')
        .select('id, first_name, last_name, department, department_id, role, avatar_url, created_at', { count: 'exact' });

    if (search) {
        // Industry standard search: ilike for case-insensitive search across multiple columns
        query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,department.ilike.%${search}%`);
    }

    if (selectedDepartment !== 'all') {
        query = query.eq('department_id', selectedDepartment);
    }

    // Apply pagination
    const from = (page - 1) * WORKERS_PAGE_SIZE;
    const to = from + WORKERS_PAGE_SIZE - 1;

    const { data: workers, count, error } = await query
        .order('created_at', { ascending: false })
        .range(from, to);

    if (error) {
        console.error("Error fetching workers:", error);
    }

    const headByWorkerId = new Map(
        departmentOptions
            .filter((dept: any) => dept.head_user_id)
            .map((dept: any) => [dept.head_user_id as string, { id: dept.id, name: dept.name }])
    );

    const formattedWorkers = (workers || []).map((worker) => {
        const headDepartment = headByWorkerId.get(worker.id);

        return {
            ...worker,
            head_department_id: headDepartment?.id || null,
            head_department_name: headDepartment?.name || null,
        };
    });

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
        />
    );
}
