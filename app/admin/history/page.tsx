import { createClient } from "@/utils/supabase/server";
import HistoryClient from "./HistoryClient";


export const metadata = {
    title: "Global Attendance History | Admin Portal",
};

export default async function HistoryPage(props: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
    const searchParams = await props.searchParams;
    const page = typeof searchParams.page === 'string' ? parseInt(searchParams.page, 10) : 1;
    const search = typeof searchParams.search === 'string' ? searchParams.search : '';
    const pageSize = 20;

    const supabase = await createClient();

    // 1. If there's a search term, first find the matching user profiles
    let matchingUserIds: string[] | null = null;
    if (search) {
        const { data: matchedProfiles } = await supabase
            .from('profiles')
            .select('id')
            .or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%`);
            
        if (matchedProfiles && matchedProfiles.length > 0) {
            matchingUserIds = matchedProfiles.map(p => p.id);
        } else {
            // Search yielded no users, so there will be no logs.
            matchingUserIds = [];
        }
    }

    // 2. Query attendance logs with pagination
    let query = supabase
        .from('attendance_logs')
        .select(`
            id,
            user_id,
            check_in_time,
            check_out_time,
            status,
            department,
            session:attendance_sessions (
                event:events (title)
            )
        `, { count: 'exact' });

    if (matchingUserIds !== null) {
        if (matchingUserIds.length === 0) {
            // Force empty result if search didn't match any users
            query = query.in('user_id', ['00000000-0000-0000-0000-000000000000']);
        } else {
            query = query.in('user_id', matchingUserIds);
        }
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data: logs, count, error } = await query
        .order('check_in_time', { ascending: false })
        .range(from, to);

    if (error) {
        console.error("Error fetching history:", error);
    }

    // 3. Fetch the profile details for the fetched logs
    let profilesMap: Record<string, any> = {};
    if (logs && logs.length > 0) {
        const userIdsToFetch = Array.from(new Set(logs.map(log => log.user_id)));
        const { data: profilesData } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, avatar_url')
            .in('id', userIdsToFetch);
            
        if (profilesData) {
            profilesMap = profilesData.reduce((acc, p) => {
                acc[p.id] = p;
                return acc;
            }, {} as Record<string, any>);
        }
    }

    const totalPages = count ? Math.ceil(count / pageSize) : 1;

    // Transform data safely for the client
    const formattedLogs = (logs || []).map(log => {
        const p = profilesMap[log.user_id];
        const s = Array.isArray(log.session) ? log.session[0] : log.session;
        const e = s ? (Array.isArray(s.event) ? s.event[0] : s.event) : null;
        
        return {
            id: log.id,
            check_in_time: log.check_in_time,
            check_out_time: log.check_out_time,
            status: log.status,
            department: log.department,
            worker_name: `${p?.first_name || 'Unknown'} ${p?.last_name || ''}`.trim(),
            avatar_url: p?.avatar_url || null,
            event_title: e?.title || 'Unknown Event'
        };
    });

    return (
        <HistoryClient 
            logs={formattedLogs} 
            currentPage={page} 
            totalPages={totalPages} 
            totalCount={count || 0}
            initialSearch={search}
        />
    );
}
