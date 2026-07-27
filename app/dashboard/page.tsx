import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import DashboardClient from './DashboardClient';
import { HISTORY_PAGE_SIZE } from '@/lib/constants';
import type { AttendanceLog } from '@/lib/types'; 

type BroadcastEventJoin = { title: string } | { title: string }[] | null;

function getBroadcastTitle(event: BroadcastEventJoin) {
    if (Array.isArray(event)) return event[0]?.title || 'Live Session';
    return event?.title || 'Live Session';
}

export default async function DashboardServerPage() {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
        redirect('/auth/login');
    }

    
    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

    
    let username = "User";
    let initials = "U";
    let department = "Worker";
    let team: string | null = null;

    if (profile) {
        
        username = profile.first_name || "User";
        department = profile.department || "Worker";
        team = profile.team || null;
        initials = username.substring(0, 2).toUpperCase();
    } else {
        
        if (user.user_metadata?.department) department = user.user_metadata.department;
        if (user.email) {
            username = user.email.split('@')[0];
            initials = username.substring(0, 2).toUpperCase();
        }
    }

    
    const { data: activeSession } = await supabase
        .from('attendance_logs')
        .select('id, check_in_time')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();

    
    const { data: activeBroadcastSession } = await supabase
        .from('attendance_sessions')
        .select('id, event:events(title)')
        .eq('status', 'active')
        .maybeSingle();

    const formattedBroadcast = activeBroadcastSession ? {
        id: activeBroadcastSession.id,
        title: getBroadcastTitle(activeBroadcastSession.event)
    } : null;

    
    const { data: historyData } = await supabase
        .from('attendance_logs')
        .select('id, check_in_time, check_out_time, status')
        .eq('user_id', user.id)
        .order('check_in_time', { ascending: false })
        .order('id', { ascending: false })
        .limit(HISTORY_PAGE_SIZE + 1);

    const initialHasMore = (historyData?.length ?? 0) > HISTORY_PAGE_SIZE;
    const initialHistory: AttendanceLog[] = (historyData ?? [])
        .slice(0, HISTORY_PAGE_SIZE)
        .map(row => ({
            id: row.id,
            check_in_time: row.check_in_time,
            check_out_time: row.check_out_time,
            status: row.status,
        }));
    
    
    
    
    
    
    

    
    const { data: activeLocations } = await supabase
        .from('locations')
        .select('id, name, latitude, longitude, radius')
        .eq('is_active', true);

    const { data: headedDepartment } = await supabase
        .from('departments')
        .select('name')
        .eq('head_user_id', user.id)
        .maybeSingle();

    return (
        <DashboardClient
            key={`${formattedBroadcast?.id ?? 'no-broadcast'}:${activeSession?.id ?? 'not-checked-in'}:${activeSession?.check_in_time ?? 'no-check-in-time'}`}
            userId={user.id}
            username={username}
            initials={initials}
            department={department}
            team={team}
            initialIsCheckedIn={!!activeSession}
            checkInTime={activeSession?.check_in_time || null}
            serverTime={new Date().toISOString()}
            initialHistory={initialHistory}
            initialHasMore={initialHasMore}
            avatarUrl={profile?.avatar_url || null}
            initialBroadcastSession={formattedBroadcast}
            activeLocations={activeLocations || []}
            headDepartmentName={headedDepartment?.name || null}
        />
    );
}
