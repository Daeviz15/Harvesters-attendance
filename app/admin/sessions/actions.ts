"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

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
        
        // Check if there is already an active session for this event
        const { data: existingSession } = await supabase
            .from('attendance_sessions')
            .select('id')
            .eq('event_id', eventId)
            .eq('status', 'active')
            .maybeSingle();

        if (existingSession) {
            return { error: "An active session already exists for this event." };
        }

        // Insert new active session
        const { error } = await supabase
            .from('attendance_sessions')
            .insert([{ 
                event_id: eventId,
                created_by: user.id,
                status: 'active'
            }]);

        if (error) {
            console.error("Begin Session Error:", error);
            // The unique constraint will block concurrent creation attempts
            if (error.code === '23505') {
                return { error: "An active session already exists for this event." };
            }
            return { error: "Failed to begin session. Please try again." };
        }

        revalidatePath("/admin/sessions");
        revalidatePath("/admin");
        return { success: true };
    } catch (e: any) {
        return { error: e.message || "An unexpected error occurred." };
    }
}

export async function endSession(sessionId: string) {
    try {
        const { supabase } = await verifyAdminServer();
        
        // Call the secure RPC function to end the session and auto-checkout users
        // The RPC uses SECURITY DEFINER but internally checks is_admin(), making it 100% secure.
        const { error } = await supabase.rpc('end_attendance_session', {
            session_uuid: sessionId
        });

        if (error) {
            console.error("End Session Error:", error);
            return { error: "Failed to end session. It may have already ended." };
        }

        revalidatePath("/admin/sessions");
        revalidatePath("/admin");
        return { success: true };
    } catch (e: any) {
        return { error: e.message || "An unexpected error occurred." };
    }
}
