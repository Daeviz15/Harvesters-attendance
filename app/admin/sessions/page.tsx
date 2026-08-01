import { createClient } from "@/utils/supabase/server";
import { requireAdminAuth } from "@/lib/rbac";
import SessionsClient from "./SessionsClient";

export const metadata = {
    title: "Session Controller | Admin Portal",
};

type ActiveSession = {
    id: string;
    event_id: string;
    start_time: string;
    scheduled_start_at: string | null;
    scheduled_end_at: string | null;
    started_by_mode: "manual" | "auto" | null;
    ended_by_mode: "manual" | "auto" | null;
    event: { title: string };
};

export default async function AdminSessionsPage() {
    const scope = await requireAdminAuth();
    const supabase = await createClient();

    // Build events query with RBAC scope filtering
    let eventsQuery = supabase
        .from('events')
        .select('*')
        .order('created_at', { ascending: false });

    // Department Heads: only see events they created or assigned to their department(s)
    if (!scope.isSuperAdmin) {
        const filterParts: string[] = [];

        for (const id of scope.managedDepartmentIds) {
            filterParts.push(`department_id.eq.${id}`);
        }

        filterParts.push(`created_by.eq.${scope.user.id}`);
        eventsQuery = eventsQuery.or(filterParts.join(','));
    }

    // Parallelize events and activeSessions queries
    const [eventsRes, sessionsRes] = await Promise.all([
        eventsQuery,
        supabase
            .from('attendance_sessions')
            .select(`
                id, 
                event_id, 
                start_time,
                scheduled_start_at,
                scheduled_end_at,
                started_by_mode,
                ended_by_mode,
                event:events (
                    title
                )
            `)
            .eq('status', 'active')
    ]);

    if (eventsRes.error) {
        console.error("Failed to fetch events:", eventsRes.error);
    }
    if (sessionsRes.error) {
        console.error("Failed to fetch active sessions:", sessionsRes.error);
    }

    const events = eventsRes.data || [];
    const activeSessions = sessionsRes.data || [];

    // For Department Heads: filter active sessions to only those whose event_id is in their scoped events
    let scopedSessions = activeSessions;
    if (!scope.isSuperAdmin) {
        const allowedEventIds = new Set(events.map(e => e.id));
        scopedSessions = activeSessions.filter(s => allowedEventIds.has(s.event_id));
    }

    const formattedSessions: ActiveSession[] = scopedSessions.map(session => ({
        ...session,
        event: Array.isArray(session.event) ? session.event[0] : session.event,
    }));

    return (
        <SessionsClient 
            events={events} 
            activeSessions={formattedSessions} 
        />
    );
}
