import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
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
    const supabase = await createClient();

    // Parallelize events and activeSessions queries to eliminate waterfalls
    const [eventsRes, sessionsRes] = await Promise.all([
        supabase
            .from('events')
            .select('*')
            .order('created_at', { ascending: false }),
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

    const formattedSessions: ActiveSession[] = activeSessions.map(session => ({
        ...session,
        event: Array.isArray(session.event) ? session.event[0] : session.event,
    }));

    return (
        <SessionsClient 
            events={events || []} 
            activeSessions={formattedSessions} 
        />
    );
}
