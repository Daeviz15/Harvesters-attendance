'use server';

import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { assessLocationConfirmation } from '@/lib/location-confirmation';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { HISTORY_PAGE_SIZE } from '@/lib/constants';
import type { AttendanceLog, AttendanceHistoryResponse } from '@/lib/types';
import { validateDateOfBirth } from '@/lib/date-of-birth';
import { APP_TIME_ZONE, getDateKeyInTimeZone } from '@/lib/business-time';

type CheckInEvent = {
    location_ids: string[] | null;
    department_id: string | null;
    team_id: string | null;
    created_by: string | null;
} | null;

const checkInLocationSchema = z.object({
    lat: z.coerce.number().finite().min(-90).max(90),
    lng: z.coerce.number().finite().min(-180).max(180),
    accuracy: z.coerce.number().finite().min(0).max(10_000),
    positionTimestamp: z.coerce.number().finite().int().positive(),
});

const optionalFormNumber = z.preprocess(
    (value) => value === null || value === '' ? undefined : value,
    z.coerce.number().finite().optional(),
);

const checkInAssistanceSchema = z.object({
    sessionId: z.string().uuid('Invalid attendance session.'),
    reportedStatus: z.enum(['low_accuracy', 'not_confirmed', 'unavailable']),
    reportedAccuracyMeters: optionalFormNumber.refine(
        (value) => value === undefined || (value >= 0 && value <= 10_000),
        'Invalid location accuracy.',
    ),
    nearestLocationId: z.preprocess(
        (value) => value === null || value === '' ? undefined : value,
        z.string().uuid().optional(),
    ),
    nearestDistanceMeters: optionalFormNumber.refine(
        (value) => value === undefined || (value >= 0 && value <= 1_000_000),
        'Invalid location distance.',
    ),
    positionTimestamp: z.preprocess(
        (value) => value === null || value === '' ? undefined : value,
        z.coerce.number().finite().int().positive().optional(),
    ),
    workerMessage: z.string().trim().max(500, 'Your message cannot exceed 500 characters.').optional(),
});

const leaveRequestSchema = z.object({
    leaveType: z.enum(["Sick Leave", "Personal", "Travel", "Family Emergency", "Other"]),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Please select a valid start date."),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Please select a valid end date."),
    reason: z.string().trim().min(5, "Please provide a brief reason.").max(500, "Reason cannot exceed 500 characters."),
});

const earlyLeaveReturnSchema = z.object({
    leaveRequestId: z.string().uuid("Invalid leave request."),
    returnNote: z.string().trim().max(500, "Return note cannot exceed 500 characters.").optional(),
});

function parseDateOnly(value: string) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day));
}

async function getActiveProfileForUser(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
    const { data: profile, error } = await supabase
        .from('profiles')
        .select('id, department_id, department, team, team_id, is_active')
        .eq('id', userId)
        .maybeSingle();

    if (error) {
        if (error.code === '42703' || error.message?.toLowerCase().includes('is_active')) {
            const { data: fallbackProfile, error: fallbackError } = await supabase
                .from('profiles')
                .select('id, department_id, department, team, team_id')
                .eq('id', userId)
                .maybeSingle();

            if (fallbackError) {
                console.error('[Dashboard] Failed to verify active profile fallback:', fallbackError);
                return null;
            }

            return fallbackProfile ? { ...fallbackProfile, is_active: true } : null;
        }

        console.error('[Dashboard] Failed to verify active profile:', error);
        return null;
    }

    if (!profile || profile.is_active === false) {
        return null;
    }

    return profile;
}

export async function updateMyDateOfBirth(formData: FormData) {
    const birthDate = validateDateOfBirth(formData.get('dateOfBirth'));
    if (birthDate.error || !birthDate.dateOfBirth) {
        return { error: birthDate.error || 'Please enter a valid birthday.' };
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { error: 'Authentication required. Please log in.' };
    }

    const activeProfile = await getActiveProfileForUser(supabase, user.id);
    if (!activeProfile) {
        return { error: 'Your account is no longer active. Please contact an administrator.' };
    }

    const { data: updatedProfile, error } = await supabase
        .from('profiles')
        .update({
            date_of_birth: birthDate.dateOfBirth,
            updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)
        .select('id')
        .maybeSingle();

    if (error || !updatedProfile) {
        console.error('[Dashboard] Failed to update date of birth:', error);
        return { error: 'Could not save your birthday. Please try again.' };
    }

    revalidatePath('/dashboard');
    revalidatePath('/admin');
    return { success: true };
}

export async function verifyAndCheckIn(formData: FormData) {
    const sessionId = formData.get('sessionId')?.toString();

    if (!sessionId) {
        return { error: 'No active session broadcast detected. Please wait for an Admin to start a session.' };
    }
    const parsed = checkInLocationSchema.safeParse({
        lat: formData.get('lat'),
        lng: formData.get('lng'),
        accuracy: formData.get('accuracy'),
        positionTimestamp: formData.get('positionTimestamp'),
    });
    if (!parsed.success) {
        return { error: 'A fresh, accurate location reading is required. Refresh your location and try again.' };
    }

    const { lat, lng, accuracy, positionTimestamp } = parsed.data;
    const receivedAt = Date.now();
    // Allow up to 15 minutes age for mobile/browser GPS readings, plus 5 minutes clock skew tolerance
    const maxAgeMs = 15 * 60_000;
    const maxClockSkewMs = 5 * 60_000;
    if (
        positionTimestamp > receivedAt + maxClockSkewMs
        || positionTimestamp < receivedAt - maxAgeMs
    ) {
        return { error: 'Your location reading is out of date. Tap "Refresh location" and try again.' };
    }

    const supabase = await createClient();


    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return { error: 'Authentication required. Please log in.' };
    }

    const { data: sessionData, error: sessionError } = await supabase
        .from('attendance_sessions')
        .select('id, status, created_by, events(location_ids, department_id, team_id, created_by)')
        .eq('id', sessionId)
        .single();

    if (sessionError || !sessionData || sessionData.status !== 'active') {
        return { error: 'This attendance session is no longer active or could not be found.' };
    }

    const eventObj = (Array.isArray(sessionData.events) ? sessionData.events[0] : sessionData.events) as CheckInEvent;
    const eventDeptId = eventObj?.department_id ?? null;
    const eventTeamId = eventObj?.team_id ?? null;

    // Fetch the user's profile once — used for department authorization AND check-in record
    const workerProfile = await getActiveProfileForUser(supabase, user.id);
    if (!workerProfile) {
        return { error: 'Your account is no longer active. Please contact an administrator.' };
    }

    // Friendly fail-fast check. A database trigger repeats this rule at write
    // time so a direct API call or a concurrent leave change cannot bypass it.
    const currentBusinessDate = getDateKeyInTimeZone(new Date(), APP_TIME_ZONE);
    const { data: activeLeaveRows, error: activeLeaveError } = await supabase
        .from('leave_requests')
        .select('id, end_date')
        .eq('user_id', user.id)
        .eq('status', 'approved')
        .lte('start_date', currentBusinessDate)
        .gte('end_date', currentBusinessDate)
        .is('returned_early_at', null)
        .limit(1);

    if (activeLeaveError) {
        console.error('[Dashboard] Failed to verify approved leave before check-in:', activeLeaveError);
        return { error: 'Could not verify your leave status. Please try again.' };
    }

    if ((activeLeaveRows?.length || 0) > 0) {
        return {
            error: `You are currently on approved leave through ${activeLeaveRows?.[0]?.end_date}. End your leave early before checking in.`,
        };
    }

    // Defense-in-depth: If the session is department/team-scoped, verify worker membership.
    if (eventDeptId || eventTeamId) {
        let isAuthorized = false;

        if (sessionData.created_by === user.id || eventObj?.created_by === user.id) {
            isAuthorized = true;
        } else if (workerProfile?.department_id && workerProfile.department_id === eventDeptId) {
            isAuthorized = true;
        } else if (!eventDeptId && eventTeamId && workerProfile?.team_id === eventTeamId) {
            isAuthorized = true;
        } else if (workerProfile?.department) {
            const lookupDepartmentId = eventDeptId || workerProfile.department_id;
            const { data: targetDept } = lookupDepartmentId
                ? await supabase
                    .from('departments')
                    .select('name, team_id')
                    .eq('id', lookupDepartmentId)
                    .maybeSingle()
                : { data: null };

            if (targetDept?.name) {
                const cleanUserDept = workerProfile.department.toLowerCase().trim();
                const cleanTargetDept = targetDept.name.toLowerCase().trim();
                if (cleanUserDept === cleanTargetDept) {
                    isAuthorized = true;
                }
            }

            if (!eventDeptId && eventTeamId && targetDept?.team_id === eventTeamId) {
                isAuthorized = true;
            }
        }

        if (!isAuthorized) {
            return { error: 'Unauthorized: This live session is restricted to members of a different team or department.' };
        }
    }

    const eventLocationIds = eventObj?.location_ids as string[] | undefined;
    const allowedLocationIds: string[] = eventLocationIds || [];

    if (allowedLocationIds.length === 0) {
        return { error: 'Security constraint: This event has no branch locations assigned. Please contact an administrator to update the event.' };
    }


    const { data: activeLocations, error: locError } = await supabase
        .from('locations')
        .select('latitude, longitude, radius, name, id, max_check_in_accuracy_meters, check_in_distance_buffer_meters')
        .eq('is_active', true)
        .in('id', allowedLocationIds);

    if (locError || !activeLocations || activeLocations.length === 0) {
        return { error: 'The locations assigned to this event are currently inactive or invalid. Check-in is disabled.' };
    }


    const locationConfirmation = assessLocationConfirmation(lat, lng, accuracy, activeLocations);
    if (locationConfirmation.status === 'low_accuracy') {
        return {
            error: `Your phone's GPS is still too rough (about ${Math.round(accuracy)} m). Step outside briefly or near a window for a better reading, then try again.`,
        };
    }

    if (locationConfirmation.status !== 'confirmed') {
        return {
            error: 'Your phone\'s GPS reading doesn\'t match the venue yet. Try moving closer to a window or door and tap "Refresh location" — this often helps indoors.',
        };
    }

    // 5. Use the profile already fetched above for the check-in record
    const department = workerProfile?.department || user.user_metadata?.department || 'Unknown';
    const team = workerProfile?.team || user.user_metadata?.team || null;

    // 6. Check if the user is already checked in to THIS session
    const { data: activeSession } = await supabase
        .from('attendance_logs')
        .select('id, check_in_time')
        .eq('user_id', user.id)
        .eq('session_id', sessionId)
        .eq('status', 'active')
        .maybeSingle();

    if (activeSession) {
        return {
            success: true,
            alreadyCheckedIn: true,
            checkedInAt: activeSession.check_in_time,
        };
    }

    // Insert the check-in record
    const { data: insertedAttendance, error: dbError } = await supabase
        .from('attendance_logs')
        .insert({
            user_id: user.id,
            session_id: sessionId,
            department,
            team,
            check_in_lat: lat,
            check_in_lng: lng,
            check_in_accuracy_meters: accuracy,
            check_in_position_timestamp: new Date(positionTimestamp).toISOString(),
            status: 'active'
        })
        .select('check_in_time')
        .single();

    if (dbError) {
        if (dbError.message?.includes('LEAVE_ACTIVE')) {
            return { error: 'You are currently on approved leave. End your leave early before checking in.' };
        }
        // A concurrent retry may win the insert race. Read the canonical row
        // and return the same successful state instead of surfacing an error.
        if (dbError.code === '23505' || dbError.message.includes('unique')) {
            const { data: existingAttendance } = await supabase
                .from('attendance_logs')
                .select('check_in_time')
                .eq('user_id', user.id)
                .eq('session_id', sessionId)
                .eq('status', 'active')
                .maybeSingle();

            if (existingAttendance) {
                revalidatePath('/dashboard');
                return {
                    success: true,
                    alreadyCheckedIn: true,
                    checkedInAt: existingAttendance.check_in_time,
                };
            }

            return { error: 'A check-in already exists. Refresh the page to view your current attendance status.' };
        }
        console.error("Supabase insert error:", dbError);
        return { error: 'Database error: Could not log check-in.' };
    }

    revalidatePath('/dashboard');
    return {
        success: true,
        alreadyCheckedIn: false,
        checkedInAt: insertedAttendance.check_in_time,
    };
}

/**
 * Reports a check-in problem to the worker's scoped event leaders.
 *
 * This action deliberately sends no latitude/longitude and cannot create an
 * attendance record. Postgres repeats authentication, event-scope, leave,
 * rate-limit, and duplicate-request checks atomically.
 */
export async function requestCheckInAssistance(formData: FormData) {
    const parsed = checkInAssistanceSchema.safeParse({
        sessionId: formData.get('sessionId'),
        reportedStatus: formData.get('reportedStatus'),
        reportedAccuracyMeters: formData.get('reportedAccuracyMeters'),
        nearestLocationId: formData.get('nearestLocationId'),
        nearestDistanceMeters: formData.get('nearestDistanceMeters'),
        positionTimestamp: formData.get('positionTimestamp'),
        workerMessage: formData.get('workerMessage')?.toString() || undefined,
    });

    if (!parsed.success) {
        return { error: parsed.error.issues[0]?.message || 'Please check the assistance request.' };
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return { error: 'Authentication required. Please log in.' };
    }

    const activeProfile = await getActiveProfileForUser(supabase, user.id);
    if (!activeProfile) {
        return { error: 'Your account is no longer active. Please contact an administrator.' };
    }

    const input = parsed.data;
    const rawLat = formData.get('lat')?.toString();
    const rawLng = formData.get('lng')?.toString();
    let formattedMessage = input.workerMessage || null;
    if (rawLat && rawLng && !isNaN(Number(rawLat)) && !isNaN(Number(rawLng))) {
        const coordsTag = `[Coords: ${Number(rawLat).toFixed(6)}, ${Number(rawLng).toFixed(6)}]`;
        formattedMessage = formattedMessage ? `${formattedMessage.trim()} ${coordsTag}` : coordsTag;
    }

    const { data, error } = await supabase.rpc('request_my_check_in_assistance', {
        p_session_id: input.sessionId,
        p_reported_status: input.reportedStatus,
        p_reported_accuracy_meters: input.reportedAccuracyMeters ?? null,
        p_nearest_location_id: input.nearestLocationId ?? null,
        p_nearest_distance_meters: input.nearestDistanceMeters ?? null,
        p_position_timestamp: input.positionTimestamp
            ? new Date(input.positionTimestamp).toISOString()
            : null,
        p_worker_message: formattedMessage,
    });

    if (error) {
        console.error('[Dashboard] Failed to request check-in assistance:', {
            code: error.code,
            message: error.message,
        });

        if (error.message.includes('no longer active')) {
            return { error: 'This event is no longer accepting check-ins.' };
        }
        if (error.message.includes('Attendance has already been recorded')) {
            return { error: 'Your attendance is already recorded. Refresh the dashboard to see it.' };
        }
        if (error.message.includes('Resume duty')) {
            return { error: 'You are on approved leave. Resume duty before requesting check-in help.' };
        }
        if (error.code === '42900' || error.message.includes('Too many assistance requests')) {
            return { error: 'You have sent several requests recently. Please speak directly with an event leader.' };
        }
        if (error.code === '42883') {
            return { error: 'Check-in assistance is not configured yet. Please contact an administrator.' };
        }
        return { error: 'We could not notify your event leaders. Please try again.' };
    }

    const result = Array.isArray(data) ? data[0] : data;
    revalidatePath('/admin/check-in-assistance');

    return {
        success: true,
        requestId: result?.request_id as string | undefined,
        alreadyOpen: result?.already_open === true,
    };
}

export async function fetchMyAssistanceStatus(sessionId: string) {
    if (!sessionId) return { request: null, isCheckedIn: false, checkedInAt: null };
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { request: null, isCheckedIn: false, checkedInAt: null };

    const adminSupabase = createAdminClient();
    const { data: request } = await adminSupabase
        .from('check_in_assistance_requests')
        .select('id, status, worker_message, resolution_note, created_at, resolved_at')
        .eq('user_id', user.id)
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    const { data: attendance } = await adminSupabase
        .from('attendance_logs')
        .select('id, check_in_time')
        .eq('user_id', user.id)
        .eq('session_id', sessionId)
        .eq('status', 'active')
        .maybeSingle();

    return {
        request: request ?? null,
        isCheckedIn: !!attendance,
        checkedInAt: attendance?.check_in_time ?? null,
    };
}

export async function manualCheckOut(formData: FormData) {
    const latStr = formData.get('lat');
    const lngStr = formData.get('lng');

    let lat: number | null = null;
    let lng: number | null = null;

    if (latStr !== null && latStr !== '') {
        const latNum = Number(latStr);
        if (!isNaN(latNum) && latNum >= -90 && latNum <= 90) {
            lat = latNum;
        }
    }
    if (lngStr !== null && lngStr !== '') {
        const lngNum = Number(lngStr);
        if (!isNaN(lngNum) && lngNum >= -180 && lngNum <= 180) {
            lng = lngNum;
        }
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { error: 'Unauthorized request.' };
    }

    const activeProfile = await getActiveProfileForUser(supabase, user.id);
    if (!activeProfile) {
        return { error: 'Your account is no longer active. Please contact an administrator.' };
    }

    // Update the active check-in record for this user, chaining .select() to verify rows were modified
    const { data, error: dbError } = await supabase
        .from('attendance_logs')
        .update({
            check_out_time: new Date().toISOString(),
            check_out_lat: lat,
            check_out_lng: lng,
            status: 'completed'
        })
        .eq('user_id', user.id)
        .eq('status', 'active')
        .select();

    if (dbError) {
        console.error("Supabase update error:", dbError);
        return { error: 'Database error: Could not log check-out.' };
    }

    // Prevent fake success reporting
    if (!data || data.length === 0) {
        return { error: 'No active check-in found to checkout.' };
    }

    revalidatePath('/dashboard');
    return { success: true };
}

/**
 * Cursor-based paginated fetch for attendance history.
 *
 * Industry-standard keyset pagination:
 * - Uses (check_in_time, id) as a composite cursor for deterministic ordering.
 * - Fetches `limit + 1` rows to detect if more data exists, avoiding an expensive COUNT(*).
 * - Performance is O(1) regardless of table size — no OFFSET scanning.
 *
 * @param cursor  ISO timestamp of the last loaded item's check_in_time (optional).
 * @param cursorId  UUID of the last loaded item (optional, needed to break timestamp ties).
 */
export async function fetchAttendanceHistory(
    cursor?: string,
    cursorId?: string
): Promise<AttendanceHistoryResponse> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { logs: [], hasMore: false };
    }

    const activeProfile = await getActiveProfileForUser(supabase, user.id);
    if (!activeProfile) {
        return { logs: [], hasMore: false };
    }

    let query = supabase
        .from('attendance_logs')
        .select('id, check_in_time, check_out_time, status')
        .eq('user_id', user.id)
        .order('check_in_time', { ascending: false })
        .order('id', { ascending: false })
        .limit(HISTORY_PAGE_SIZE + 1);

    // Apply cursor filter for subsequent pages
    if (cursor && cursorId) {
        // Composite cursor: fetch rows that come AFTER the cursor position
        // Using .or() for the keyset condition: (check_in_time < cursor) OR (check_in_time = cursor AND id < cursorId)
        query = query.or(
            `check_in_time.lt.${cursor},and(check_in_time.eq.${cursor},id.lt.${cursorId})`
        );
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching attendance history:', error);
        return { logs: [], hasMore: false };
    }

    const hasMore = (data?.length ?? 0) > HISTORY_PAGE_SIZE;
    const logs: AttendanceLog[] = (data ?? [])
        .slice(0, HISTORY_PAGE_SIZE)
        .map(row => ({
            id: row.id,
            check_in_time: row.check_in_time,
            check_out_time: row.check_out_time,
            status: row.status,
        }));

    return { logs, hasMore };
}

/**
 * Submits a new leave request for the authenticated user.
 */
export async function submitLeaveRequest(formData: FormData) {
    const parsed = leaveRequestSchema.safeParse({
        leaveType: formData.get('leaveType'),
        startDate: formData.get('startDate'),
        endDate: formData.get('endDate'),
        reason: formData.get('reason'),
    });

    if (!parsed.success) {
        return { error: parsed.error.issues[0]?.message || "Please check your leave request." };
    }

    const { leaveType, startDate, endDate, reason } = parsed.data;

    // Server-side date validation
    const start = parseDateOnly(startDate);
    const end = parseDateOnly(endDate);
    const todayUtc = parseDateOnly(getDateKeyInTimeZone(new Date(), APP_TIME_ZONE));

    if (start < todayUtc) {
        return { error: "Start Date cannot be in the past." };
    }

    if (end < start) {
        return { error: "End Date cannot be earlier than Start Date." };
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { error: "Unauthorized request." };
    }

    const activeProfile = await getActiveProfileForUser(supabase, user.id);
    if (!activeProfile) {
        return { error: 'Your account is no longer active. Please contact an administrator.' };
    }

    const { error } = await supabase
        .from('leave_requests')
        .insert({
            user_id: user.id,
            leave_type: leaveType,
            start_date: startDate,
            end_date: endDate,
            reason,
            status: 'pending'
        });

    if (error) {
        console.error("Leave request submission error:", error);
        if (error.message?.includes('LEAVE_OVERLAP')) {
            return { error: "You already have a pending or approved leave request for these dates." };
        }
        return { error: "Failed to submit request. Please try again." };
    }

    revalidatePath('/admin/leave-requests');
    return { success: true };
}

/**
 * Fetches all leave requests for the currently authenticated user.
 */
export async function fetchMyLeaveRequests() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return [];
    }

    const activeProfile = await getActiveProfileForUser(supabase, user.id);
    if (!activeProfile) {
        return [];
    }

    const { data, error } = await supabase
        .from('leave_requests')
        .select('id, user_id, leave_type, start_date, end_date, reason, status, created_at, reviewed_at, review_note, returned_early_at, returned_early_by, return_note')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Failed to fetch leave requests:", error);
        throw new Error("Failed to load history.");
    }

    return data;
}

/**
 * Ends the authenticated worker's currently active approved leave.
 * Ownership and lifecycle validation are repeated atomically in Postgres.
 */
export async function endMyLeaveEarly(formData: FormData) {
    const parsed = earlyLeaveReturnSchema.safeParse({
        leaveRequestId: formData.get('leaveRequestId'),
        returnNote: formData.get('returnNote') || undefined,
    });

    if (!parsed.success) {
        return { error: parsed.error.issues[0]?.message || 'Invalid early return request.' };
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { error: 'Authentication required. Please log in.' };
    }

    const activeProfile = await getActiveProfileForUser(supabase, user.id);
    if (!activeProfile) {
        return { error: 'Your account is no longer active. Please contact an administrator.' };
    }

    const { error } = await supabase.rpc('end_my_leave_early', {
        p_leave_request_id: parsed.data.leaveRequestId,
        p_return_note: parsed.data.returnNote || null,
    });

    if (error) {
        console.error('[Dashboard] Failed to end approved leave early:', error);
        if (error.message?.includes('already been ended early')) {
            return { error: 'This leave has already been ended early. Refreshing the page should show your current status.' };
        }
        if (error.message?.includes('Only currently active leave')) {
            return { error: 'Only a leave that is active today can be ended early.' };
        }
        if (error.message?.includes('Only approved leave')) {
            return { error: 'This leave is not approved and cannot be ended early.' };
        }
        if (error.message?.includes('Leave request not found')) {
            return { error: 'This leave request is unavailable or does not belong to your account.' };
        }
        return { error: 'Could not resume duty right now. Please try again.' };
    }

    revalidatePath('/dashboard');
    revalidatePath('/admin/leave-requests');
    return { success: true };
}

/**
 * Lightweight heartbeat check: verifies if a broadcast session is still active.
 * Used as a polling fallback in case Supabase Realtime misses an update.
 */
export async function checkSessionAlive(sessionId: string): Promise<boolean> {
    const supabase = await createClient();
    const { data } = await supabase
        .from('attendance_sessions')
        .select('id')
        .eq('id', sessionId)
        .eq('status', 'active')
        .maybeSingle();

    return !!data;
}

/**
 * Lightweight check to see if any attendance session is currently active.
 * Used by DashboardClient when no broadcast is currently displayed to detect
 * when an admin quick-starts or begins a session without needing a full browser reload.
 */
export async function checkHasLiveSession(): Promise<boolean> {
    const supabase = await createClient();
    const { data } = await supabase
        .from('attendance_sessions')
        .select('id')
        .eq('status', 'active')
        .limit(1);

    return (data && data.length > 0) || false;
}

