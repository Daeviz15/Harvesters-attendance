import { createClient } from "@/utils/supabase/server";
import HistoryClient from "./HistoryClient";
import { getAttendanceAnalytics } from "../sessions/actions";

export const metadata = {
    title: "Global Attendance History | Admin Portal",
};

const HISTORY_PAGE_SIZE = 20;

type HistoryProfile = {
    id: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
};

export default async function HistoryPage(props: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
    const searchParams = await props.searchParams;
    const parsedPage = typeof searchParams.page === 'string' ? parseInt(searchParams.page, 10) : 1;
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const search = typeof searchParams.search === 'string' ? searchParams.search : '';

    const supabase = await createClient();

    let matchingUserIds: string[] | null = null;
    if (search) {
        const { data: matchedProfiles } = await supabase
            .from('profiles')
            .select('id')
            .or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%`);

        if (matchedProfiles && matchedProfiles.length > 0) {
            matchingUserIds = matchedProfiles.map(p => p.id);
        } else {
            matchingUserIds = [];
        }
    }

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
            query = query.in('user_id', ['00000000-0000-0000-0000-000000000000']);
        } else {
            query = query.in('user_id', matchingUserIds);
        }
    }

    const from = (page - 1) * HISTORY_PAGE_SIZE;
    const to = from + HISTORY_PAGE_SIZE - 1;

    // Parallelize history query and analytics fetch
    const [historyRes, analyticsRes] = await Promise.all([
        query
            .order('check_in_time', { ascending: false })
            .range(from, to),
        getAttendanceAnalytics(),
    ]);

    const logs = historyRes.data || [];
    const count = historyRes.count || 0;
    if (historyRes.error) {
        console.error("Error fetching history:", historyRes.error);
    }

    let profilesMap: Record<string, HistoryProfile> = {};
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
            }, {} as Record<string, HistoryProfile>);
        }
    }

    const totalPages = count ? Math.ceil(count / HISTORY_PAGE_SIZE) : 1;

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

    const analytics = analyticsRes.data || {
        totalCheckIns: 0,
        selfGpsCheckIns: 0,
        proxyCheckIns: 0,
        gpsRatePercent: 0,
        activeSessionsCount: 0,
        totalWorkersCount: 0,
        ministryTurnout: [],
        topDepartments: [],
        latestSessionSummary: null,
        attendanceTrends: [],
    };

    return (
        <HistoryClient
            logs={formattedLogs}
            currentPage={page}
            totalPages={totalPages}
            totalCount={count || 0}
            initialSearch={search}
            pageSize={HISTORY_PAGE_SIZE}
            analytics={analytics}
        />
    );
}
