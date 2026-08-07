import { createClient } from "@/utils/supabase/server";
import { requireAdminAuth } from "@/lib/rbac";
import AdminDashboardClient from "./AdminDashboardClient";
import { getDepartmentAttendanceBreakdown } from "./sessions/actions";

type ActiveSessionRow = {
    id: string;
    event_id: string | null;
    event: { title: string } | { title: string }[] | null;
};

export default async function AdminDashboardPage() {
    const scope = await requireAdminAuth();
    const supabase = await createClient();

    // 1. Build Workers Count Query with RBAC scope
    let workersQuery = supabase.from('profiles').select('*', { count: 'exact', head: true });
    if (!scope.isSuperAdmin) {
        workersQuery = workersQuery.in('department_id', scope.managedDepartmentIds);
    }

    // 2. Build Events Count Query with RBAC scope
    let eventsQuery = supabase.from('events').select('id', { count: 'exact' });
    if (!scope.isSuperAdmin) {
        const filterParts: string[] = [];
        for (const id of scope.managedDepartmentIds) {
            filterParts.push(`department_id.eq.${id}`);
        }
        for (const id of scope.managedTeamIds) {
            filterParts.push(`team_id.eq.${id}`);
        }
        filterParts.push(`created_by.eq.${scope.user.id}`);
        eventsQuery = eventsQuery.or(filterParts.join(','));
    }

    // 3. Departments Query with RBAC scope
    let departmentsQuery = supabase
        .from('departments')
        .select('id, name, is_active')
        .eq('is_active', true)
        .order('name', { ascending: true });
    if (!scope.isSuperAdmin) {
        departmentsQuery = departmentsQuery.in('id', scope.managedDepartmentIds);
    }

    // Parallelize independent DB queries to eliminate waterfalls
    const [
        workerRes,
        eventsRes,
        departmentsRes,
        activeSessionsRes,
        breakdownRes,
    ] = await Promise.all([
        workersQuery,
        eventsQuery,
        departmentsQuery,
        supabase.from('attendance_sessions').select('id, event_id, event:events(title)').eq('status', 'active'),
        getDepartmentAttendanceBreakdown(),
    ]);

    const allEvents = eventsRes.data || [];
    const totalEventsCount = eventsRes.count !== null ? eventsRes.count : allEvents.length;

    let activeSessionsList = (activeSessionsRes.data || []) as ActiveSessionRow[];
    if (!scope.isSuperAdmin) {
        const allowedEventIds = new Set(allEvents.map(e => e.id));
        activeSessionsList = activeSessionsList.filter((s) => s.event_id && allowedEventIds.has(s.event_id));
    }

    const workerCount = workerRes.count || 0;
    const activeSessionsCount = activeSessionsList.length;
    const departments = departmentsRes.data || [];

    const formattedActiveSessions = activeSessionsList.map((s) => ({
        id: s.id as string,
        title: (Array.isArray(s.event) ? s.event[0]?.title : s.event?.title) || "Active Session",
    }));

    const initialBreakdown = breakdownRes.data || { totalCheckedIn: 0, ministries: [] };

    return (
        <AdminDashboardClient
            workerCount={workerCount}
            activeSessionsCount={activeSessionsCount}
            totalEventsCount={totalEventsCount}
            departments={departments}
            activeSessions={formattedActiveSessions}
            initialBreakdown={initialBreakdown}
        />
    );
}
