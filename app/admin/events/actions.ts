"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

// Industry standard: Verify admin role on EVERY server action securely
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

    return supabase;
}

export async function createEvent(formData: FormData) {
    try {
        const supabase = await verifyAdminServer();
        
        const title = formData.get("title")?.toString().trim();
        const description = formData.get("description")?.toString().trim() || null;

        if (!title || title.length < 3) {
            return { error: "Event title must be at least 3 characters." };
        }

        const { error } = await supabase
            .from('events')
            .insert([{ title, description }]);

        if (error) {
            console.error("Create Event Error:", error);
            return { error: "Failed to create event. Please try again." };
        }

        revalidatePath("/admin/events");
        revalidatePath("/admin");
        return { success: true };
    } catch (e: any) {
        return { error: e.message || "An unexpected error occurred." };
    }
}

export async function updateEvent(id: string, formData: FormData) {
    try {
        const supabase = await verifyAdminServer();
        
        const title = formData.get("title")?.toString().trim();
        const description = formData.get("description")?.toString().trim() || null;

        if (!title || title.length < 3) {
            return { error: "Event title must be at least 3 characters." };
        }

        const { error } = await supabase
            .from('events')
            .update({ title, description })
            .eq('id', id);

        if (error) {
            console.error("Update Event Error:", error);
            return { error: "Failed to update event." };
        }

        revalidatePath("/admin/events");
        return { success: true };
    } catch (e: any) {
        return { error: e.message || "An unexpected error occurred." };
    }
}

export async function deleteEvent(id: string) {
    try {
        const supabase = await verifyAdminServer();
        
        const { error } = await supabase
            .from('events')
            .delete()
            .eq('id', id);

        if (error) {
            console.error("Delete Event Error:", error);
            return { error: "Failed to delete event." };
        }

        revalidatePath("/admin/events");
        revalidatePath("/admin");
        return { success: true };
    } catch (e: any) {
        return { error: e.message || "An unexpected error occurred." };
    }
}
