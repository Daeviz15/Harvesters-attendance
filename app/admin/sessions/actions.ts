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
