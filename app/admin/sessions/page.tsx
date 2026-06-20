import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import SessionsClient from "./SessionsClient";

export const metadata = {
    title: "Session Controller | Admin Portal",
};

export default async function AdminSessionsPage() {
    const supabase = await createClient();

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        redirect("/auth/login");
    }

    // Verify admin role
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (!profile || profile.role !== 'admin') {
        redirect("/dashboard");
    }

    // Fetch all events
    const { data: events, error: eventsError } = await supabase
        .from('events')
        .select('*')
        .order('created_at', { ascending: false });

    if (eventsError) {
        console.error("Failed to fetch events:", eventsError);
    }

    // Fetch active sessions joined with event titles
    const { data: activeSessions, error: sessionsError } = await supabase
        .from('attendance_sessions')
        .select(`
            id, 
            event_id, 
            start_time,
            event:events (
                title
            )
        `)
        .eq('status', 'active');

    if (sessionsError) {
        console.error("Failed to fetch active sessions:", sessionsError);
    }

    // Transform nested event relation
    const formattedSessions = (activeSessions || []).map(session => ({
        ...session,
        event: Array.isArray(session.event) ? session.event[0] : session.event,
    }));

    return (
        <SessionsClient 
            events={events || []} 
            activeSessions={formattedSessions as any} 
        />
    );
}
