import { createClient } from "@/utils/supabase/server";
import { requireAdminAuth } from "@/lib/rbac";
import EventsClient from "./EventsClient";

export const metadata = {
    title: "Events Management | Admin Portal",
};

export default async function AdminEventsPage() {
    const scope = await requireAdminAuth();
    const supabase = await createClient();

    // Build events query with RBAC scope filtering
    let eventsQuery = supabase
        .from('events')
        .select('*')
        .order('created_at', { ascending: false });

    // Scoped admins only see events they created, team events for their team, or events assigned to their departments.
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

    let departmentsQuery = supabase
        .from('departments')
        .select('id, name, team_id')
        .eq('is_active', true)
        .order('name', { ascending: true });

    if (!scope.isSuperAdmin) {
        departmentsQuery = departmentsQuery.in('id', scope.managedDepartmentIds);
    }

    let workersQuery = supabase
        .from('profiles')
        .select('id, first_name, last_name, worker_id, department, department_id')
        .eq('role', 'worker')
        .order('first_name', { ascending: true });

    if (!scope.isSuperAdmin) {
        workersQuery = workersQuery.in('department_id', scope.managedDepartmentIds);
    }

    const [eventsRes, locationsRes, departmentsRes, activeSessionsRes, workersRes] = await Promise.all([
        eventsQuery,
        supabase
            .from('locations')
            .select('id, name')
            .eq('is_active', true)
            .order('name', { ascending: true }),
        departmentsQuery,
        supabase
            .from('attendance_sessions')
            .select('event_id')
            .eq('status', 'active'),
        workersQuery,
    ]);

    if (eventsRes.error) {
        console.error("Failed to fetch events:", eventsRes.error);
    }
    if (locationsRes.error) {
        console.error("Failed to fetch locations:", locationsRes.error);
    }
    if (workersRes.error) {
        console.error("Failed to fetch workers:", workersRes.error);
    }

    const events = eventsRes.data || [];
    const locations = locationsRes.data || [];
    const activeEventIds = (activeSessionsRes.data || []).map((s: { event_id: string }) => s.event_id);
    const workers = (workersRes.data || []) as { id: string, first_name: string, last_name: string, worker_id: string, department: string }[];

    const departmentsForSelector = (departmentsRes?.data || []).map((d: { id: string; name: string; team_id: string | null }) => ({
        id: d.id,
        name: d.name,
        team_id: d.team_id,
    }));

    return (
        <EventsClient
            initialEvents={events}
            activeLocations={locations}
            isSuperAdmin={scope.isSuperAdmin}
            isTeamAdmin={scope.isTeamAdmin}
            managedDepartments={departmentsForSelector}
            activeEventIds={activeEventIds}
            workers={workers}
        />
    );
}
