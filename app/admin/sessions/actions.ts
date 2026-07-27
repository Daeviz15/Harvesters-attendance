"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : "An unexpected error occurred.";
}

// Helper to securely verify admin role
async function verifyAdminServer() {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) throw new Error("Unauthorized");

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (!profile || profile.role !== 'admin') {
        throw new Error("Forbidden: Admin access required");
    }

    return { supabase, user };
}

export async function beginSession(eventId: string) {
    try {
        const { supabase, user } = await verifyAdminServer();

        const { error } = await supabase.rpc('start_attendance_session', {
            event_uuid: eventId,
            actor_uuid: user.id,
        });

        if (error) {
            console.error("Begin Session Error:", error);
            if (error.code === '42883') {
                return { error: "Session automation migration is missing. Run supabase_session_automation_migration.sql first." };
            }
            if (error.code === '23505') {
                return { error: "An active session already exists for this event." };
            }
            return { error: "Failed to begin session. Please try again." };
        }

        revalidatePath("/admin/sessions");
        revalidatePath("/admin");
        revalidatePath("/dashboard");
        return { success: true };
    } catch (e: unknown) {
        return { error: getErrorMessage(e) };
    }
}

export async function endSession(sessionId: string) {
    try {
        const { supabase } = await verifyAdminServer();
        
        const { error } = await supabase.rpc('end_attendance_session', {
            session_uuid: sessionId,
        });

        if (error) {
            console.error("End Session Error:", error);
            if (error.code === '42883') {
                return { error: "Session automation migration is missing. Run supabase_session_automation_migration.sql first." };
            }
            return { error: "Failed to end session. It may have already ended." };
        }

        revalidatePath("/admin/sessions");
        revalidatePath("/admin");
        revalidatePath("/dashboard");
        return { success: true };
    } catch (e: unknown) {
        return { error: getErrorMessage(e) };
    }
}

export async function searchWorkersForCheckIn(query: string, sessionId: string) {
    try {
        const { supabase } = await verifyAdminServer();
        const cleanQuery = query.trim().replace(/[,()]/g, ' ').trim();

        // 1. Get already checked-in workers for this session
        const { data: existingLogs } = await supabase
            .from("attendance_logs")
            .select("user_id")
            .eq("session_id", sessionId)
            .eq("status", "active");

        const checkedInUserIds = new Set((existingLogs || []).map((log) => log.user_id));

        // 2. Query profiles
        let profilesQuery = supabase
            .from("profiles")
            .select("id, first_name, last_name, email, phone, department, avatar_url, role, worker_id")
            .order("first_name", { ascending: true })
            .limit(50);

        if (cleanQuery.length > 0) {
            profilesQuery = profilesQuery.or(
                `first_name.ilike.%${cleanQuery}%,last_name.ilike.%${cleanQuery}%,email.ilike.%${cleanQuery}%,phone.ilike.%${cleanQuery}%,department.ilike.%${cleanQuery}%,worker_id.ilike.%${cleanQuery}%`
            );
        }

        let { data: workers, error } = await profilesQuery;

        // Robust production fallback: If worker_id column is not yet created in Supabase SQL editor, fall back to standard selection
        if (error && (error.code === '42703' || error.message?.toLowerCase().includes('worker_id'))) {
            let fallbackQuery = supabase
                .from("profiles")
                .select("id, first_name, last_name, email, phone, department, avatar_url, role")
                .order("first_name", { ascending: true })
                .limit(50);

            if (cleanQuery.length > 0) {
                fallbackQuery = fallbackQuery.or(
                    `first_name.ilike.%${cleanQuery}%,last_name.ilike.%${cleanQuery}%,email.ilike.%${cleanQuery}%,phone.ilike.%${cleanQuery}%,department.ilike.%${cleanQuery}%`
                );
            }

            const fallbackRes = await fallbackQuery;
            workers = (fallbackRes.data || []).map((w: any) => ({ ...w, worker_id: null }));
            error = fallbackRes.error;
        }

        if (error) {
            console.error("Search Workers Error:", error);
            return { error: "Failed to search workers." };
        }

        const formattedWorkers = (workers || []).map((w) => ({
            ...w,
            isCheckedIn: checkedInUserIds.has(w.id),
        }));

        return { data: formattedWorkers };
    } catch (e: unknown) {
        return { error: getErrorMessage(e) };
    }
}

export async function manualWorkerCheckIn(params: { workerId: string; sessionId: string; note?: string }) {
    try {
        const { supabase, user: adminUser } = await verifyAdminServer();
        const { workerId, sessionId, note } = params;

        if (!workerId || !sessionId) {
            return { error: "Worker ID and Session ID are required." };
        }

        // 1. Verify session is active
        const { data: session, error: sessionError } = await supabase
            .from("attendance_sessions")
            .select("id, status")
            .eq("id", sessionId)
            .single();

        if (sessionError || !session || session.status !== "active") {
            return { error: "This session is no longer active." };
        }

        // 2. Check if worker is already checked in
        const { data: existingCheckIn } = await supabase
            .from("attendance_logs")
            .select("id")
            .eq("user_id", workerId)
            .eq("session_id", sessionId)
            .eq("status", "active")
            .maybeSingle();

        if (existingCheckIn) {
            return { error: "Worker is already checked in for this session." };
        }

        // 3. Fetch worker profile for department details
        const { data: workerProfile } = await supabase
            .from("profiles")
            .select("department, team")
            .eq("id", workerId)
            .single();

        // 4. Perform proxy manual check-in
        const { error: insertError } = await supabase
            .from("attendance_logs")
            .insert({
                user_id: workerId,
                session_id: sessionId,
                department: workerProfile?.department || "General",
                team: workerProfile?.team || null,
                status: "active",
                is_manual: true,
                checked_in_by: adminUser.id,
                check_in_note: note || "Manually checked in by Admin",
            });

        if (insertError) {
            console.error("Manual Check-In Insert Error:", insertError);
            return { error: "Database error: Could not complete manual check-in." };
        }

        revalidatePath("/admin/sessions");
        revalidatePath("/admin/history");
        revalidatePath("/admin");
        revalidatePath("/dashboard");

        return { success: true };
    } catch (e: unknown) {
        return { error: getErrorMessage(e) };
    }
}

