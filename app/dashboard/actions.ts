'use server';

import { createClient } from '@/utils/supabase/server';
import { calculateDistanceInMeters } from '@/lib/geolocation';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { TARGET_LAT, TARGET_LNG, MAX_DISTANCE_METERS, HISTORY_PAGE_SIZE } from '@/lib/constants';
import type { AttendanceLog, AttendanceHistoryResponse } from '@/lib/types';

// Strict Zod schema for ensuring valid coordinates
const locationSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180)
});

export async function verifyAndCheckIn(formData: FormData) {
    const latStr = formData.get('lat');
    const lngStr = formData.get('lng');

    // Prevent silent coercion bugs where missing values become 0 (in the ocean off Africa)
    if (latStr === null || lngStr === null || latStr === '' || lngStr === '') {
        return { error: 'Missing GPS coordinates. Please ensure location services are enabled.' };
    }

    const parsed = locationSchema.safeParse({ lat: latStr, lng: lngStr });
    if (!parsed.success) {
        return { error: 'Invalid GPS coordinates provided.' };
    }

    const { lat, lng } = parsed.data;

    const distance = calculateDistanceInMeters(lat, lng, TARGET_LAT, TARGET_LNG);

    // Server-Side Verification: Ensure they are actually within 100m
    if (distance > MAX_DISTANCE_METERS) {
        return { error: `Verification failed: You are ${Math.round(distance)} meters away. You must be within ${MAX_DISTANCE_METERS} meters.` };
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { error: 'Unauthorized request.' };
    }

    // Fetch the true department from the profiles table (Production Database)
    const { data: profile } = await supabase
        .from('profiles')
        .select('department')
        .eq('id', user.id)
        .single();

    const department = profile?.department || user.user_metadata?.department || 'Unknown';

    // Check if there is an active session
    const { data: activeSession } = await supabase
        .from('attendance_logs')
        .select('id, check_in_time')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();

    if (activeSession) {
        const checkInTime = new Date(activeSession.check_in_time).getTime();
        const hoursSinceCheckIn = (Date.now() - checkInTime) / (1000 * 60 * 60);

        if (hoursSinceCheckIn > 12) {
            // Stale check-in. Auto-checkout the old session to make way for the new one.
            await supabase
                .from('attendance_logs')
                .update({
                    check_out_time: new Date().toISOString(),
                    status: 'auto_completed'
                })
                .eq('id', activeSession.id);
        } else {
            return { error: 'You are already checked in. You must check out before checking in again.' };
        }
    }

    // Insert the check-in record
    const { error: dbError } = await supabase
        .from('attendance_logs')
        .insert({
            user_id: user.id,
            department,
            check_in_lat: lat,
            check_in_lng: lng,
            status: 'active'
        });

    if (dbError) {
        // Catch the new unique constraint to return a friendly error
        if (dbError.code === '23505' || dbError.message.includes('unique')) {
            return { error: 'You are already checked in. You must check out before checking in again.' };
        }
        console.error("Supabase insert error:", dbError);
        return { error: 'Database error: Could not log check-in.' };
    }

    revalidatePath('/dashboard');
    return { success: true };
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

export async function autoCheckout(formData: FormData) {
    const latStr = formData.get('lat');
    const lngStr = formData.get('lng');

    let lat: number | null = null;
    let lng: number | null = null;

    if (latStr !== null && latStr !== '' && lngStr !== null && lngStr !== '') {
        const parsed = locationSchema.safeParse({ lat: latStr, lng: lngStr });
        if (parsed.success) {
            lat = parsed.data.lat;
            lng = parsed.data.lng;

            // Verify they are actually outside the boundary to record a valid audit trail
            const distance = calculateDistanceInMeters(lat, lng, TARGET_LAT, TARGET_LNG);
            if (distance <= MAX_DISTANCE_METERS) {
                return { error: 'Auto-checkout rejected: User is still inside the perimeter.' };
            }
        }
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { error: 'Unauthorized request.' };
    }

    // Auto-checkout happens when they leave the zone, so we mark it specifically as auto_completed
    const { data, error: dbError } = await supabase
        .from('attendance_logs')
        .update({
            check_out_time: new Date().toISOString(),
            check_out_lat: lat,
            check_out_lng: lng,
            status: 'auto_completed'
        })
        .eq('user_id', user.id)
        .eq('status', 'active')
        .select();

    if (dbError) {
        console.error("Supabase auto-checkout error:", dbError);
        return { error: 'Database error while auto checking out.' };
    }

    if (!data || data.length === 0) {
        return { error: 'No active check-in found to auto-checkout.' };
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
    const leaveType = formData.get('leaveType') as string;
    const startDate = formData.get('startDate') as string;
    const endDate = formData.get('endDate') as string;
    const reason = formData.get('reason') as string;

    if (!leaveType || !startDate || !endDate || !reason) {
        return { error: "All fields are required." };
    }

    // Server-side date validation
    const start = new Date(startDate);
    const end = new Date(endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (start < today) {
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

    const { error } = await supabase
        .from('leave_requests')
        .insert({
            user_id: user.id,
            leave_type: leaveType,
            start_date: startDate,
            end_date: endDate,
            reason: reason,
            status: 'pending'
        });

    if (error) {
        console.error("Leave request submission error:", error);
        return { error: "Failed to submit request. Please try again." };
    }

    return { success: true };
}

/**
 * Fetches all leave requests for the currently authenticated user.
 */
export async function fetchMyLeaveRequests() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        throw new Error("Unauthorized request.");
    }

    const { data, error } = await supabase
        .from('leave_requests')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Failed to fetch leave requests:", error);
        throw new Error("Failed to load history.");
    }

    return data;
}
