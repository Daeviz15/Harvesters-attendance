"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

async function requireAdmin() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { supabase, adminUser: null, error: "Not authenticated." };

    const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

    if (profile?.role !== "admin") {
        return { supabase, adminUser: null, error: "Unauthorized." };
    }

    return { supabase, adminUser: user, error: null };
}

export async function assignDepartmentHead(workerId: string) {
    const { supabase, error: authError } = await requireAdmin();
    if (authError) return { error: authError };

    const workerIdResult = z.string().uuid().safeParse(workerId);
    if (!workerIdResult.success) return { error: "Invalid worker selected." };

    const { data: worker, error: workerError } = await supabase
        .from("profiles")
        .select("id, department_id, department")
        .eq("id", workerIdResult.data)
        .single();

    if (workerError || !worker) {
        return { error: "Worker not found." };
    }

    if (!worker.department_id) {
        return { error: "This worker does not have a managed department yet." };
    }

    const { data: department, error: departmentError } = await supabase
        .from("departments")
        .select("id, name, is_active")
        .eq("id", worker.department_id)
        .single();

    if (departmentError || !department) {
        return { error: "Worker department could not be found." };
    }

    const { error } = await supabase
        .from("departments")
        .update({ head_user_id: worker.id })
        .eq("id", department.id);

    if (error) {
        console.error("Error assigning department head:", error);
        return { error: "Failed to assign department head." };
    }

    revalidatePath("/admin/workers");
    revalidatePath("/admin/departments");
    revalidatePath("/dashboard");
    return { success: true };
}

export async function removeDepartmentHead(departmentId: string) {
    const { supabase, error: authError } = await requireAdmin();
    if (authError) return { error: authError };

    const departmentIdResult = z.string().uuid().safeParse(departmentId);
    if (!departmentIdResult.success) return { error: "Invalid department selected." };

    const { error } = await supabase
        .from("departments")
        .update({ head_user_id: null })
        .eq("id", departmentIdResult.data);

    if (error) {
        console.error("Error removing department head:", error);
        return { error: "Failed to remove department head." };
    }

    revalidatePath("/admin/workers");
    revalidatePath("/admin/departments");
    revalidatePath("/dashboard");
    return { success: true };
}

const registerWorkerSchema = z.object({
    firstName: z.string().trim().min(2, "First Name must be at least 2 characters."),
    lastName: z.string().trim().min(2, "Last Name must be at least 2 characters."),
    email: z.string().trim().email("Please enter a valid email address.").or(z.literal("")).optional(),
    phone: z.string().trim().optional(),
    department: z.string().trim().optional(),
    departmentId: z.string().uuid().optional().nullable(),
    role: z.enum(["worker", "admin"]).default("worker"),
    checkInSessionId: z.string().uuid().optional(),
    checkInNote: z.string().trim().optional(),
});

/**
 * Generates a unique Worker ID in format HRV-XXXX (4-char alphanumeric).
 * Uses a collision-safe retry loop — with 36^4 = ~1.68M possible values,
 * collisions are statistically near-impossible at typical org sizes.
 */
async function generateUniqueWorkerId(supabaseClient: Awaited<ReturnType<typeof createClient>>): Promise<string> {
    const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const ID_LENGTH = 4;
    const MAX_RETRIES = 5;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        let code = "";
        for (let i = 0; i < ID_LENGTH; i++) {
            code += CHARSET[Math.floor(Math.random() * CHARSET.length)];
        }
        const candidateId = `HRV-${code}`;

        const { data: existing } = await supabaseClient
            .from("profiles")
            .select("id")
            .eq("worker_id", candidateId)
            .maybeSingle();

        if (!existing) return candidateId;
    }

    // Fallback: use timestamp-based ID if all retries collide (extremely unlikely)
    return `HRV-${Date.now().toString(36).toUpperCase().slice(-5)}`;
}

export async function createWorkerAccount(formData: FormData) {
    const { supabase, adminUser, error: authError } = await requireAdmin();
    if (authError || !adminUser) return { error: authError || "Unauthorized." };

    const rawData = {
        firstName: formData.get("firstName")?.toString() || "",
        lastName: formData.get("lastName")?.toString() || "",
        email: formData.get("email")?.toString() || "",
        phone: formData.get("phone")?.toString() || "",
        department: formData.get("department")?.toString() || "",
        departmentId: formData.get("departmentId")?.toString() || undefined,
        role: (formData.get("role")?.toString() as "worker" | "admin") || "worker",
        checkInSessionId: formData.get("checkInSessionId")?.toString() || undefined,
        checkInNote: formData.get("checkInNote")?.toString() || undefined,
    };

    const parsed = registerWorkerSchema.safeParse(rawData);
    if (!parsed.success) {
        return { error: parsed.error.issues[0]?.message || "Invalid worker details." };
    }

    const {
        firstName,
        lastName,
        email: userEmail,
        phone,
        department,
        departmentId,
        role,
        checkInSessionId,
        checkInNote,
    } = parsed.data;

    // Auto-generate unique Worker ID (HRV-XXXX)
    const workerId = await generateUniqueWorkerId(supabase);

    // Fallback identity email generation for workers without smartphones or email addresses
    const cleanPhone = phone ? phone.replace(/\D/g, "") : "";
    const generatedEmail = userEmail && userEmail.length > 0
        ? userEmail
        : `worker.${cleanPhone || Date.now()}.${Math.floor(Math.random() * 1000)}@harvestersng.org`;

    // Secure temporary password for admin-created accounts
    const randomPassword = `H@rvest_${Math.random().toString(36).slice(-8)}${Math.floor(Math.random() * 90 + 10)}`;

    try {
        const adminClient = createAdminClient();
        
        // 1. Create Auth user via Supabase Service Role (does not log out current admin)
        const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
            email: generatedEmail,
            password: randomPassword,
            email_confirm: true,
            user_metadata: {
                first_name: firstName,
                last_name: lastName,
                phone: phone || null,
                department: department || null,
                role: role,
            },
        });

        if (createError || !newUser.user) {
            console.error("Error creating auth user:", createError);
            return { error: createError?.message || "Failed to create worker account." };
        }

        const userId = newUser.user.id;

        // 2. Upsert worker details in profiles table with auto-generated worker_id
        const { error: profileError } = await adminClient
            .from("profiles")
            .upsert({
                id: userId,
                first_name: firstName,
                last_name: lastName,
                email: generatedEmail,
                phone: phone || null,
                department: department || null,
                department_id: departmentId || null,
                role: role,
                worker_id: workerId,
                updated_at: new Date().toISOString(),
            });

        if (profileError) {
            console.error("Error updating worker profile:", profileError);
            return { error: "Worker created, but profile details failed to save." };
        }

        // 3. Optional Instant Check-In if an active session was passed
        if (checkInSessionId) {
            // Verify session is active
            const { data: session } = await supabase
                .from("attendance_sessions")
                .select("id, status")
                .eq("id", checkInSessionId)
                .eq("status", "active")
                .single();

            if (session) {
                await supabase
                    .from("attendance_logs")
                    .insert({
                        user_id: userId,
                        session_id: session.id,
                        department: department || "General",
                        status: "active",
                        is_manual: true,
                        checked_in_by: adminUser.id,
                        check_in_note: checkInNote || "Account registered and checked in by Admin",
                    });
            }
        }

        revalidatePath("/admin/workers");
        revalidatePath("/admin/sessions");
        revalidatePath("/dashboard");

        return { success: true, workerId, email: generatedEmail };
    } catch (e: unknown) {
        console.error("Unexpected error in createWorkerAccount:", e);
        return { error: e instanceof Error ? e.message : "An unexpected server error occurred." };
    }
}

