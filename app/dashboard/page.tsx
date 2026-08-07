import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import DashboardClient from './DashboardClient';
import { HISTORY_PAGE_SIZE } from '@/lib/constants';
import type { AttendanceLog } from '@/lib/types'; 

type BroadcastEventJoin = { title: string } | { title: string }[] | null;
type ActiveBroadcastSession = {
    id: string;
    event_id: string;
    created_by: string | null;
    event: {
        title: string;
        department_id: string | null;
        team_id: string | null;
        created_by: string | null;
    } | {
        title: string;
        department_id: string | null;
        team_id: string | null;
        created_by: string | null;
    }[] | null;
};

function getBroadcastTitle(event: BroadcastEventJoin) {
    if (Array.isArray(event)) return event[0]?.title || 'Live Session';
    return event?.title || 'Live Session';
}

function shouldPromptForMissingBirthday(profile: { role: string | null; worker_id: string | null; date_of_birth: string | null } | null) {
    if (!profile?.worker_id || profile.date_of_birth) return false;
    return !['admin', 'super_admin'].includes(profile.role || '');
}

export default async function DashboardServerPage() {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
        redirect('/auth/login');
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, role, department_id, department, team_id, team, worker_id, avatar_url, phone, date_of_birth')
        .eq('id', user.id)
        .single();

    let username = "User";
    let initials = "U";
    let department = "Worker";
    let team: string | null = null;
    let workerId: string | null = null;

    if (profile) {
        username = profile.first_name || "User";
        department = profile.department || "Worker";
        team = profile.team || null;
        workerId = profile.worker_id || null;
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

    // 1. Fetch all active departments to resolve user's department IDs (via profile, headship, or exact name match)
    const { data: allDepartments } = await supabase
        .from('departments')
        .select('id, name, team, team_id, head_user_id');

    const userDeptIds = new Set<string>();
    const userTeamIds = new Set<string>();

    if (profile?.department_id) {
        userDeptIds.add(profile.department_id);
    }
    if (profile?.team_id) {
        userTeamIds.add(profile.team_id);
    }

    let headDeptName: string | null = null;

    (allDepartments || []).forEach((d) => {
        // Department Head: always include departments they manage
        if (d.head_user_id === user.id) {
            userDeptIds.add(d.id);
            if (d.team_id) userTeamIds.add(d.team_id);
            if (!headDeptName && d.name) headDeptName = d.name;
        }

        // Exact name match: profile.department === department.name (case-insensitive)
        if (profile?.department && d.name) {
            const cleanUserDept = profile.department.toLowerCase().trim();
            const cleanDeptName = d.name.toLowerCase().trim();
            if (cleanUserDept === cleanDeptName) {
                userDeptIds.add(d.id);
                if (d.team_id) userTeamIds.add(d.team_id);
            }
        }
    });

    // 2. Fetch active broadcast sessions with event & creator scoping details
    const { data: activeBroadcastSessions } = await supabase
        .from('attendance_sessions')
        .select('id, event_id, created_by, event:events(title, department_id, team_id, created_by)')
        .eq('status', 'active')
        .order('start_time', { ascending: false });

    // 3. Robust Visibility Filtering:
    // - True global event (no department_id and no team_id)
    // - Session or Event created by this user
    // - Event department matches user's department/managed departments
    // - Team-wide event matches user's team
    const visibleSession = ((activeBroadcastSessions || []) as ActiveBroadcastSession[]).find((s) => {
        const sessionCreatedBy = s.created_by;
        const event = Array.isArray(s.event) ? s.event[0] : s.event;
        const eventCreatedBy = event?.created_by;
        const eventDeptId = event?.department_id;
        const eventTeamId = event?.team_id;

        if (!event) return true; // Fallback: show if event join is empty
        if (sessionCreatedBy === user.id || eventCreatedBy === user.id) return true; // User is session/event creator
        if (eventDeptId && userDeptIds.has(eventDeptId)) return true; // User belongs to event's department
        if (!eventDeptId && eventTeamId && userTeamIds.has(eventTeamId)) return true; // User belongs to event's team
        if (!eventDeptId && !eventTeamId) return true; // True global event
        return false;
    });

    const formattedBroadcast = visibleSession ? {
        id: visibleSession.id,
        title: getBroadcastTitle(visibleSession.event)
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

    return (
        <DashboardClient
            key={`${formattedBroadcast?.id ?? 'no-broadcast'}:${activeSession?.id ?? 'not-checked-in'}:${activeSession?.check_in_time ?? 'no-check-in-time'}`}
            userId={user.id}
            username={username}
            initials={initials}
            department={department}
            team={team}
            workerId={workerId}
            initialIsCheckedIn={!!activeSession}
            checkInTime={activeSession?.check_in_time || null}
            serverTime={new Date().toISOString()}
            initialHistory={initialHistory}
            initialHasMore={initialHasMore}
            avatarUrl={profile?.avatar_url || null}
            initialDateOfBirth={profile?.date_of_birth || null}
            shouldPromptForBirthday={shouldPromptForMissingBirthday(profile)}
            initialBroadcastSession={formattedBroadcast}
            activeLocations={activeLocations || []}
            headDepartmentName={headDeptName}
        />
    );
}
