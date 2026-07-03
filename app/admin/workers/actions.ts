"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";

async function requireAdmin() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { supabase, error: "Not authenticated." };

    const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

    if (profile?.role !== "admin") {
        return { supabase, error: "Unauthorized." };
    }

    return { supabase, error: null };
}

export async function assignDepartmentHead(workerId: string) {
    const { supabase, error: authError } = await requireAdmin();
    if (authError) return { error: authError };

    const workerIdResult = z.uuid().safeParse(workerId);
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

    const departmentIdResult = z.uuid().safeParse(departmentId);
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
