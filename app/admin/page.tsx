import { createClient } from "@/utils/supabase/server";
import AdminDashboardClient from "./AdminDashboardClient";
import { getDepartmentAttendanceBreakdown } from "./sessions/actions";

export default async function AdminDashboardPage() {
    const supabase = await createClient();

    // Parallelize all independent DB queries to eliminate waterfalls and maximize tab navigation speed
    const [
        workerRes,
        activeSessionsCountRes,
        totalEventsCountRes,
        departmentsRes,
        activeSessionsRes,
        breakdownRes,
    ] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('attendance_sessions').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('events').select('*', { count: 'exact', head: true }),
        supabase.from('departments').select('id, name, is_active').eq('is_active', true).order('name', { ascending: true }),
        supabase.from('attendance_sessions').select('id, event:events(title)').eq('status', 'active'),
        getDepartmentAttendanceBreakdown(),
    ]);

    const workerCount = workerRes.count || 0;
    const activeSessionsCount = activeSessionsCountRes.count || 0;
    const totalEventsCount = totalEventsCountRes.count || 0;
    const departments = departmentsRes.data || [];

    const formattedActiveSessions = (activeSessionsRes.data || []).map((s: any) => ({
        id: s.id as string,
        title: (Array.isArray(s.event) ? s.event[0]?.title : s.event?.title) || "Active Session",
    }));

    const initialBreakdown = breakdownRes.data || { totalCheckedIn: 0, ministries: [] };

    return (
        <AdminDashboardClient
            workerCount={workerCount || 0}
            activeSessionsCount={activeSessionsCount || 0}
            totalEventsCount={totalEventsCount || 0}
            departments={departments || []}
            activeSessions={formattedActiveSessions}
            initialBreakdown={initialBreakdown}
        />
    );
}
