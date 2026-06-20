import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import DashboardClient from './DashboardClient';
import { HISTORY_PAGE_SIZE } from '@/lib/constants';
import type { AttendanceLog, LiveFeedEvent } from '@/lib/types';

export default async function DashboardServerPage() {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
        redirect('/auth/login');
    }

    // Fetch the production profile data from the database
    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

    // Default values
    let firstName = "User";
    let fullName = "User";
    let initials = "U";
    let department = "Worker";

    if (profile) {
        // Use true database profile data
        firstName = profile.first_name || "User";
        const lastName = profile.last_name || "";
        fullName = `${firstName} ${lastName}`.trim();
        department = profile.department || "Worker";

        if (firstName && lastName) {
            initials = `${firstName[0]}${lastName[0]}`.toUpperCase();
        } else if (firstName) {
            initials = `${firstName[0]}${firstName[1] || ''}`.toUpperCase();
        }
    } else {
        // Fallback for legacy test accounts created before the trigger existed
        if (user.user_metadata?.department) department = user.user_metadata.department;
        if (user.email) {
            firstName = user.email.split('@')[0];
            fullName = firstName;
            initials = firstName.substring(0, 2).toUpperCase();
        }
    }

    // Check if the user has an active session
    const { data: activeSession } = await supabase
        .from('attendance_logs')
        .select('id, check_in_time')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();

    // Fetch the global active broadcast session
    const { data: activeBroadcastSession } = await supabase
        .from('attendance_sessions')
        .select('id, event:events(title)')
        .eq('status', 'active')
        .maybeSingle();

    const formattedBroadcast = activeBroadcastSession ? {
        id: activeBroadcastSession.id,
        title: Array.isArray(activeBroadcastSession.event)
            ? activeBroadcastSession.event[0].title
            : (activeBroadcastSession.event as any)?.title || 'Live Session'
    } : null;

    // Fetch initial attendance history (server-side, zero client latency)
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
    // Fetch initial Live Feed (latest 10 events globally)
    const { data: initialLiveFeedData } = await supabase
        .from('live_feed_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

    const initialLiveFeed: LiveFeedEvent[] = initialLiveFeedData || [];

    // Fetch active locations for geofencing
    const { data: activeLocations } = await supabase
        .from('locations')
        .select('id, name, latitude, longitude, radius')
        .eq('is_active', true);

    return (
        <DashboardClient
            userId={user.id}
            firstName={firstName}
            fullName={fullName}
            initials={initials}
            department={department}
            initialIsCheckedIn={!!activeSession}
            checkInTime={activeSession?.check_in_time || null}
            serverTime={new Date().toISOString()}
            initialHistory={initialHistory}
            initialHasMore={initialHasMore}
            initialLiveFeed={initialLiveFeed}
            avatarUrl={profile?.avatar_url || null}
            initialBroadcastSession={formattedBroadcast}
            activeLocations={activeLocations || []}
        />
    );
}
