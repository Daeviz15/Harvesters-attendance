"use server";

import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { requireSuperAdminAuth } from "@/lib/rbac";
import { revalidatePath } from "next/cache";

const requiredNumber = (label: string) => z.string()
    .trim()
    .min(1, `${label} is required.`)
    .transform((value) => Number(value))
    .pipe(z.number().finite(`${label} must be a valid number.`));

const locationInputSchema = z.object({
    name: z.string().trim().min(2, "Location name must be at least 2 characters.").max(120, "Location name cannot exceed 120 characters."),
    latitude: requiredNumber("Latitude").pipe(z.number().min(-90, "Latitude must be between -90 and 90.").max(90, "Latitude must be between -90 and 90.")),
    longitude: requiredNumber("Longitude").pipe(z.number().min(-180, "Longitude must be between -180 and 180.").max(180, "Longitude must be between -180 and 180.")),
    radius: requiredNumber("Check-in radius").pipe(z.number().min(25, "Check-in radius must be at least 25 metres.").max(5_000, "Check-in radius cannot exceed 5,000 metres.")),
    maxCheckInAccuracyMeters: requiredNumber("Maximum GPS accuracy").pipe(z.number().min(10, "Maximum GPS accuracy must be at least 10 metres.").max(250, "Maximum GPS accuracy cannot exceed 250 metres.")),
    checkInDistanceBufferMeters: requiredNumber("GPS drift buffer").pipe(z.number().min(0, "GPS drift buffer cannot be negative.").max(50, "GPS drift buffer cannot exceed 50 metres.")),
});

const locationIdSchema = z.string().uuid("Invalid location.");

function parseLocationInput(formData: FormData) {
    return locationInputSchema.safeParse({
        name: formData.get("name"),
        latitude: formData.get("latitude"),
        longitude: formData.get("longitude"),
        radius: formData.get("radius"),
        maxCheckInAccuracyMeters: formData.get("maxCheckInAccuracyMeters"),
        checkInDistanceBufferMeters: formData.get("checkInDistanceBufferMeters"),
    });
}

function revalidateLocationViews() {
    revalidatePath("/admin/locations");
    revalidatePath("/dashboard");
}

export async function createLocation(formData: FormData) {
    await requireSuperAdminAuth();
    const parsed = parseLocationInput(formData);
    if (!parsed.success) {
        return { error: parsed.error.issues[0]?.message || "Please check the location details." };
    }

    const supabase = await createClient();
    const { error } = await supabase
        .from('locations')
        .insert({
            name: parsed.data.name,
            latitude: parsed.data.latitude,
            longitude: parsed.data.longitude,
            radius: parsed.data.radius,
            max_check_in_accuracy_meters: parsed.data.maxCheckInAccuracyMeters,
            check_in_distance_buffer_meters: parsed.data.checkInDistanceBufferMeters,
            is_active: true,
        });

    if (error) {
        console.error("[Locations] Failed to create location:", error);
        return { error: "Could not create the location. Please try again." };
    }

    revalidateLocationViews();
    return { success: true };
}

export async function updateLocation(formData: FormData) {
    await requireSuperAdminAuth();
    const id = locationIdSchema.safeParse(formData.get("id"));
    const parsed = parseLocationInput(formData);
    if (!id.success) {
        return { error: id.error.issues[0]?.message || "Invalid location." };
    }
    if (!parsed.success) {
        return { error: parsed.error.issues[0]?.message || "Please check the location details." };
    }

    const supabase = await createClient();
    const { error } = await supabase
        .from('locations')
        .update({
            name: parsed.data.name,
            latitude: parsed.data.latitude,
            longitude: parsed.data.longitude,
            radius: parsed.data.radius,
            max_check_in_accuracy_meters: parsed.data.maxCheckInAccuracyMeters,
            check_in_distance_buffer_meters: parsed.data.checkInDistanceBufferMeters,
        })
        .eq('id', id.data);

    if (error) {
        console.error("[Locations] Failed to update location:", error);
        return { error: "Could not update the location. Please try again." };
    }

    revalidateLocationViews();
    return { success: true };
}

export async function toggleLocationActive(id: string, currentStatus: boolean) {
    await requireSuperAdminAuth();
    const parsedId = locationIdSchema.safeParse(id);
    if (!parsedId.success || typeof currentStatus !== "boolean") {
        return { error: "Invalid location update." };
    }

    const supabase = await createClient();
    const { error } = await supabase
        .from('locations')
        .update({ is_active: !currentStatus })
        .eq('id', parsedId.data);

    if (error) {
        console.error("[Locations] Failed to update location status:", error);
        return { error: "Could not update the location status. Please try again." };
    }

    revalidateLocationViews();
    return { success: true };
}

export async function deleteLocation(id: string) {
    await requireSuperAdminAuth();
    const parsedId = locationIdSchema.safeParse(id);
    if (!parsedId.success) {
        return { error: "Invalid location." };
    }

    const supabase = await createClient();
    const { error } = await supabase
        .from('locations')
        .delete()
        .eq('id', parsedId.data);

    if (error) {
        console.error("[Locations] Failed to delete location:", error);
        return { error: "Could not delete the location. It may still be assigned to an event." };
    }

    revalidateLocationViews();
    return { success: true };
}
