import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import WorkersClient from "./WorkersClient";



export const metadata = {
    title: "Workers Management | Admin Portal",
};

// Next.js 15 requires searchParams to be a Promise.
// We are using Next.js 15 semantics here for future-proofing and type safety.
export default async function WorkersPage(props: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
    const searchParams = await props.searchParams;
    const page = typeof searchParams.page === 'string' ? parseInt(searchParams.page, 10) : 1;
    const search = typeof searchParams.search === 'string' ? searchParams.search : '';
    const pageSize = 20;

    const supabase = await createClient();

    // The layout.tsx already ensures the user is an admin.
    // However, it's a good practice to explicitly query with the admin client.
    
    // We fetch profiles
    let query = supabase
        .from('profiles')
        .select('*', { count: 'exact' });

    if (search) {
        // Industry standard search: ilike for case-insensitive search across multiple columns
        query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,department.ilike.%${search}%`);
    }

    // Apply pagination
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data: workers, count, error } = await query
        .order('created_at', { ascending: false })
        .range(from, to);

    if (error) {
        console.error("Error fetching workers:", error);
    }

    const totalPages = count ? Math.ceil(count / pageSize) : 1;

    return (
        <WorkersClient 
            workers={workers || []} 
            currentPage={page} 
            totalPages={totalPages} 
            totalCount={count || 0}
            initialSearch={search}
        />
    );
}
