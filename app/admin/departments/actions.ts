"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";

const departmentSchema = z.object({
    name: z.string().trim().min(2, "Department name is required.").max(80, "Department name is too long."),
    team: z.enum(["PROGRAMS", "MINISTRY", "MATURITY", "MEMBERSHIP", "MISSIONS", "NEXT GEN"], { message: "Team selection is required." }),
    description: z.string().trim().max(180, "Description is too long.").optional(),
});

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

function normalizeDepartmentForm(formData: FormData) {
    const description = (formData.get("description") as string | null)?.trim();

    return departmentSchema.safeParse({
        name: formData.get("name"),
        team: formData.get("team"),
        description: description || undefined,
    });
}

export async function createDepartment(formData: FormData) {
    const { supabase, error: authError } = await requireAdmin();
    if (authError) return { error: authError };

    const parsed = normalizeDepartmentForm(formData);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Invalid department data." };

    const { error } = await supabase
        .from("departments")
        .insert({
            name: parsed.data.name,
            team: parsed.data.team,
            description: parsed.data.description || null,
            is_active: true,
        });

    if (error) {
        console.error("Error creating department:", error);
        return { error: error.code === "23505" ? "A department with this name already exists in this team." : "Failed to create department." };
    }

    revalidatePath("/admin/departments");
    revalidatePath("/onboarding");
    return { success: true };
}

export async function updateDepartment(formData: FormData) {
    const { supabase, error: authError } = await requireAdmin();
    if (authError) return { error: authError };

    const id = formData.get("id") as string | null;
    const idResult = z.string().uuid().safeParse(id);
    const parsed = normalizeDepartmentForm(formData);

    if (!idResult.success) return { error: "Invalid department selected." };
    if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Invalid department data." };

    const { error } = await supabase
        .from("departments")
        .update({
            name: parsed.data.name,
            team: parsed.data.team,
            description: parsed.data.description || null,
        })
        .eq("id", idResult.data);

    if (error) {
        console.error("Error updating department:", error);
        return { error: error.code === "23505" ? "A department with this name already exists in this team." : "Failed to update department." };
    }

    await supabase
        .from("profiles")
        .update({ department: parsed.data.name, team: parsed.data.team, updated_at: new Date().toISOString() })
        .eq("department_id", idResult.data);

    revalidatePath("/admin/departments");
    revalidatePath("/admin/workers");
    revalidatePath("/dashboard");
    revalidatePath("/onboarding");
    return { success: true };
}

export async function setDepartmentActive(id: string, isActive: boolean) {
    const { supabase, error: authError } = await requireAdmin();
    if (authError) return { error: authError };

    const idResult = z.string().uuid().safeParse(id);
    if (!idResult.success) return { error: "Invalid department selected." };

    const { error } = await supabase
        .from("departments")
        .update({ is_active: isActive })
        .eq("id", idResult.data);

    if (error) {
        console.error("Error updating department status:", error);
        return { error: "Failed to update department status." };
    }

    revalidatePath("/admin/departments");
    revalidatePath("/onboarding");
    return { success: true };
}

export async function deleteDepartment(id: string) {
    const { supabase, error: authError } = await requireAdmin();
    if (authError) return { error: authError };

    const idResult = z.string().uuid().safeParse(id);
    if (!idResult.success) return { error: "Invalid department selected." };

    const { count, error: countError } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("department_id", idResult.data);

    if (countError) {
        console.error("Error checking department usage:", countError);
        return { error: "Failed to verify department usage." };
    }

    if ((count || 0) > 0) {
        return { error: "This department has assigned workers. Deactivate it instead, or move workers before deleting it." };
    }

    const { error } = await supabase
        .from("departments")
        .delete()
        .eq("id", idResult.data);

    if (error) {
        console.error("Error deleting department:", error);
        return { error: "Failed to delete department." };
    }

    revalidatePath("/admin/departments");
    revalidatePath("/onboarding");
    return { success: true };
}
