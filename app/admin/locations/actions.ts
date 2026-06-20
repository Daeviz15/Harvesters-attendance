"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

export async function createLocation(formData: FormData) {
    const supabase = await createClient();

    // Verify admin
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (profile?.role !== 'admin') {
        return { error: "Unauthorized" };
    }

    const name = formData.get("name") as string;
    const latitude = parseFloat(formData.get("latitude") as string);
    const longitude = parseFloat(formData.get("longitude") as string);
    const radius = parseFloat(formData.get("radius") as string);

    if (!name || isNaN(latitude) || isNaN(longitude) || isNaN(radius)) {
        return { error: "Invalid data provided." };
    }

    const { error } = await supabase
        .from('locations')
        .insert({
            name,
            latitude,
            longitude,
            radius,
            is_active: true
        });

    if (error) {
        console.error("Error creating location:", error);
        return { error: "Failed to create location." };
    }

    revalidatePath("/admin/locations");
    revalidatePath("/dashboard");
    return { success: true };
}

export async function updateLocation(formData: FormData) {
    const supabase = await createClient();

    // Verify admin
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (profile?.role !== 'admin') {
        return { error: "Unauthorized" };
    }

    const id = formData.get("id") as string;
    const name = formData.get("name") as string;
    const latitude = parseFloat(formData.get("latitude") as string);
    const longitude = parseFloat(formData.get("longitude") as string);
    const radius = parseFloat(formData.get("radius") as string);

    if (!id || !name || isNaN(latitude) || isNaN(longitude) || isNaN(radius)) {
        return { error: "Invalid data provided." };
    }

    const { error } = await supabase
        .from('locations')
        .update({
            name,
            latitude,
            longitude,
            radius
        })
        .eq('id', id);

    if (error) {
        console.error("Error updating location:", error);
        return { error: "Failed to update location." };
    }

    revalidatePath("/admin/locations");
    revalidatePath("/dashboard");
    return { success: true };
}

export async function toggleLocationActive(id: string, currentStatus: boolean) {
    const supabase = await createClient();

    // Verify admin
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (profile?.role !== 'admin') {
        return { error: "Unauthorized" };
    }

    const { error } = await supabase
        .from('locations')
        .update({ is_active: !currentStatus })
        .eq('id', id);

    if (error) {
        console.error("Error toggling location:", error);
        return { error: "Failed to update location status." };
    }

    revalidatePath("/admin/locations");
    revalidatePath("/dashboard");
    return { success: true };
}

export async function deleteLocation(id: string) {
    const supabase = await createClient();

    // Verify admin
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (profile?.role !== 'admin') {
        return { error: "Unauthorized" };
    }

    const { error } = await supabase
        .from('locations')
        .delete()
        .eq('id', id);

    if (error) {
        console.error("Error deleting location:", error);
        return { error: "Failed to delete location." };
    }

    revalidatePath("/admin/locations");
    revalidatePath("/dashboard");
    return { success: true };
}
