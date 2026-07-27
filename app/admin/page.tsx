import { createClient } from "@/utils/supabase/server";
import AdminDashboardClient from "./AdminDashboardClient";

export default async function AdminDashboardPage() {
    const supabase = await createClient();

    
    const { count: workerCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

    const { count: activeSessionsCount } = await supabase
        .from('attendance_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');

    const { count: totalEventsCount } = await supabase
        .from('events')
        .select('*', { count: 'exact', head: true });

    
    const { data: departments } = await supabase
        .from('departments')
        .select('id, name, is_active')
        .eq('is_active', true)
        .order('name', { ascending: true });

    
    const { data: activeSessions } = await supabase
        .from('attendance_sessions')
        .select('id, event:events(title)')
        .eq('status', 'active');

    const formattedActiveSessions = (activeSessions || []).map((s: any) => ({
        id: s.id as string,
        title: (Array.isArray(s.event) ? s.event[0]?.title : s.event?.title) || "Active Session",
    }));

    return (
        <AdminDashboardClient
            workerCount={workerCount || 0}
            activeSessionsCount={activeSessionsCount || 0}
            totalEventsCount={totalEventsCount || 0}
            departments={departments || []}
            activeSessions={formattedActiveSessions}
        />
    );
}
