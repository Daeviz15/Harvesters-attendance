"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminAuth, type AdminAuthScope } from "@/lib/rbac";
import { createAdminClient } from "@/utils/supabase/admin";

const departmentSchema = z.object({
    name: z.string().trim().min(2, "Department name is required.").max(80, "Department name is too long."),
    team: z.enum(["PROGRAMS", "MINISTRY", "MATURITY", "MEMBERSHIP", "MISSIONS", "NEXT GEN"], { message: "Team selection is required." }),
    description: z.string().trim().max(180, "Description is too long.").optional(),
});

type DepartmentFormData = z.infer<typeof departmentSchema>;

function normalizeDepartmentForm(formData: FormData) {
    const description = (formData.get("description") as string | null)?.trim();

    return departmentSchema.safeParse({
        name: formData.get("name"),
        team: formData.get("team"),
        description: description || undefined,
    });
}

function canManageDepartments(scope: AdminAuthScope) {
    return scope.isSuperAdmin || scope.isTeamAdmin;
}

async function resolveAuthorizedTeam(
    scope: AdminAuthScope,
    parsedData: DepartmentFormData,
) {
    if (!canManageDepartments(scope)) {
        return { error: "Forbidden: You are not allowed to manage departments." } as const;
    }

    const adminSupabase = createAdminClient();

    if (scope.isSuperAdmin) {
        const { data: team, error } = await adminSupabase
            .from("teams")
            .select("id, name")
            .eq("name", parsedData.team)
            .eq("is_active", true)
            .maybeSingle();

        if (error || !team) {
            return { error: "Selected team could not be found." } as const;
        }

        return { teamId: team.id as string, teamName: team.name as string } as const;
    }

    const managedTeam = scope.managedTeams.find((team) => team.name === parsedData.team);
    if (!managedTeam) {
        return { error: "Forbidden: You can only manage departments inside your assigned team." } as const;
    }

    return { teamId: managedTeam.id, teamName: managedTeam.name } as const;
}

async function assertDepartmentInScope(scope: AdminAuthScope, departmentId: string) {
    if (!canManageDepartments(scope)) {
        return { error: "Forbidden: You are not allowed to manage departments." } as const;
    }

    if (scope.isSuperAdmin) {
        return { success: true } as const;
    }

    const adminSupabase = createAdminClient();
    const { data: department, error } = await adminSupabase
        .from("departments")
        .select("id, team_id")
        .eq("id", departmentId)
        .maybeSingle();

    if (error || !department) {
        return { error: "Department not found." } as const;
    }

    if (!department.team_id || !scope.managedTeamIds.includes(department.team_id)) {
        return { error: "Forbidden: You can only manage departments inside your assigned team." } as const;
    }

    return { success: true } as const;
}

function revalidateDepartmentViews() {
    revalidatePath("/admin/departments");
    revalidatePath("/admin/workers");
    revalidatePath("/admin/events");
    revalidatePath("/dashboard");
    revalidatePath("/onboarding");
}

export async function createDepartment(formData: FormData) {
    const scope = await requireAdminAuth();
    const parsed = normalizeDepartmentForm(formData);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Invalid department data." };

    const team = await resolveAuthorizedTeam(scope, parsed.data);
    if ("error" in team) return { error: team.error };

    const adminSupabase = createAdminClient();
    const { error } = await adminSupabase
        .from("departments")
        .insert({
            name: parsed.data.name,
            team: team.teamName,
            team_id: team.teamId,
            description: parsed.data.description || null,
            is_active: true,
        });

    if (error) {
        console.error("Error creating department:", error);
        return { error: error.code === "23505" ? "A department with this name already exists in this team." : "Failed to create department." };
    }

    revalidateDepartmentViews();
    return { success: true };
}

export async function updateDepartment(formData: FormData) {
    const scope = await requireAdminAuth();
    const id = formData.get("id") as string | null;
    const idResult = z.string().uuid().safeParse(id);
    const parsed = normalizeDepartmentForm(formData);

    if (!idResult.success) return { error: "Invalid department selected." };
    if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Invalid department data." };

    const scopeCheck = await assertDepartmentInScope(scope, idResult.data);
    if ("error" in scopeCheck) return { error: scopeCheck.error };

    const team = await resolveAuthorizedTeam(scope, parsed.data);
    if ("error" in team) return { error: team.error };

    const adminSupabase = createAdminClient();
    const { error } = await adminSupabase
        .from("departments")
        .update({
            name: parsed.data.name,
            team: team.teamName,
            team_id: team.teamId,
            description: parsed.data.description || null,
        })
        .eq("id", idResult.data);

    if (error) {
        console.error("Error updating department:", error);
        return { error: error.code === "23505" ? "A department with this name already exists in this team." : "Failed to update department." };
    }

    await adminSupabase
        .from("profiles")
        .update({
            department: parsed.data.name,
            team: team.teamName,
            team_id: team.teamId,
            updated_at: new Date().toISOString(),
        })
        .eq("department_id", idResult.data);

    await adminSupabase
        .from("events")
        .update({
            team_id: team.teamId,
            updated_at: new Date().toISOString(),
        })
        .eq("department_id", idResult.data);

    revalidateDepartmentViews();
    return { success: true };
}

export async function setDepartmentActive(id: string, isActive: boolean) {
    const scope = await requireAdminAuth();
    const idResult = z.string().uuid().safeParse(id);
    if (!idResult.success) return { error: "Invalid department selected." };

    const scopeCheck = await assertDepartmentInScope(scope, idResult.data);
    if ("error" in scopeCheck) return { error: scopeCheck.error };

    const adminSupabase = createAdminClient();
    const { error } = await adminSupabase
        .from("departments")
        .update({ is_active: isActive })
        .eq("id", idResult.data);

    if (error) {
        console.error("Error updating department status:", error);
        return { error: "Failed to update department status." };
    }

    revalidateDepartmentViews();
    return { success: true };
}

export async function deleteDepartment(id: string) {
    const scope = await requireAdminAuth();
    const idResult = z.string().uuid().safeParse(id);
    if (!idResult.success) return { error: "Invalid department selected." };

    const scopeCheck = await assertDepartmentInScope(scope, idResult.data);
    if ("error" in scopeCheck) return { error: scopeCheck.error };

    const adminSupabase = createAdminClient();
    const { count, error: countError } = await adminSupabase
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

    const { error } = await adminSupabase
        .from("departments")
        .delete()
        .eq("id", idResult.data);

    if (error) {
        console.error("Error deleting department:", error);
        return { error: "Failed to delete department." };
    }

    revalidateDepartmentViews();
    return { success: true };
}
