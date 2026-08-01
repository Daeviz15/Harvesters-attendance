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

    // Department Heads: only see events they created or events assigned to their department(s)
    if (!scope.isSuperAdmin) {
        const filterParts: string[] = [];

        // Include events assigned to any of the head's managed departments
        for (const id of scope.managedDepartmentIds) {
            filterParts.push(`department_id.eq.${id}`);
        }

        // Include events created by this user
        filterParts.push(`created_by.eq.${scope.user.id}`);

        eventsQuery = eventsQuery.or(filterParts.join(','));
    }

    // Super Admins need all active departments for the department selector
    const departmentsQuery = scope.isSuperAdmin
        ? supabase.from('departments').select('id, name').eq('is_active', true).order('name', { ascending: true })
        : null;

    const [eventsRes, locationsRes, departmentsRes, activeSessionsRes] = await Promise.all([
        eventsQuery,
        supabase
            .from('locations')
            .select('id, name')
            .eq('is_active', true)
            .order('name', { ascending: true }),
        departmentsQuery || Promise.resolve({ data: null, error: null }),
        supabase
            .from('attendance_sessions')
            .select('event_id')
            .eq('status', 'active'),
    ]);

    if (eventsRes.error) {
        console.error("Failed to fetch events:", eventsRes.error);
    }
    if (locationsRes.error) {
        console.error("Failed to fetch locations:", locationsRes.error);
    }

    const events = eventsRes.data || [];
    const locations = locationsRes.data || [];
    const activeEventIds = (activeSessionsRes.data || []).map((s: { event_id: string }) => s.event_id);

    // Super Admins get all departments; Dept Heads get their managed departments
    const departmentsForSelector = scope.isSuperAdmin
        ? (departmentsRes?.data || []).map((d: { id: string; name: string }) => ({ id: d.id, name: d.name }))
        : scope.managedDepartments;

    return (
        <EventsClient
            initialEvents={events}
            activeLocations={locations}
            isSuperAdmin={scope.isSuperAdmin}
            managedDepartments={departmentsForSelector}
            activeEventIds={activeEventIds}
        />
    );
}
