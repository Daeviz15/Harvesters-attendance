"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { generateTeamWorkerId } from "@/lib/workerId";
import { validateDateOfBirth } from "@/lib/date-of-birth";
import { requireAdminManagementAuth as requireAdminAuth } from "@/lib/rbac";
import { ADD_WORKER_RESTRICTED_MESSAGE, canManageWorkerAccess } from "@/lib/admin-permissions";

const editableRoles = ["worker", "admin", "team_admin", "reports_admin"] as const;
type EditableRole = (typeof editableRoles)[number];

function isEditableRole(role: string): role is EditableRole {
    return editableRoles.includes(role as EditableRole);
}

export async function assignDepartmentHead(workerId: string) {
    const scope = await requireAdminAuth();
    if (!scope.isSuperAdmin && !scope.isTeamAdmin) {
        return { error: "Forbidden: You are not allowed to assign Department Heads." };
    }

    const workerIdResult = z.string().uuid().safeParse(workerId);
    if (!workerIdResult.success) return { error: "Invalid worker selected." };

    const adminSupabase = createAdminClient();
    const { data: worker, error: workerError } = await adminSupabase
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

    const { data: department, error: departmentError } = await adminSupabase
        .from("departments")
        .select("id, name, is_active, team_id")
        .eq("id", worker.department_id)
        .single();

    if (departmentError || !department) {
        return { error: "Worker department could not be found." };
    }

    if (!scope.isSuperAdmin && (!department.team_id || !scope.managedTeamIds.includes(department.team_id))) {
        return { error: "Forbidden: You can only assign Department Heads inside your team." };
    }

    const { error } = await adminSupabase
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
    const scope = await requireAdminAuth();
    if (!scope.isSuperAdmin && !scope.isTeamAdmin) {
        return { error: "Forbidden: You are not allowed to remove Department Heads." };
    }

    const departmentIdResult = z.string().uuid().safeParse(departmentId);
    if (!departmentIdResult.success) return { error: "Invalid department selected." };

    const adminSupabase = createAdminClient();

    if (!scope.isSuperAdmin) {
        const { data: department, error: departmentError } = await adminSupabase
            .from("departments")
            .select("id, team_id")
            .eq("id", departmentIdResult.data)
            .maybeSingle();

        if (departmentError || !department) {
            return { error: "Department not found." };
        }

        if (!department.team_id || !scope.managedTeamIds.includes(department.team_id)) {
            return { error: "Forbidden: You can only remove Department Heads inside your team." };
        }
    }

    const { error } = await adminSupabase
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
    dateOfBirth: z.string().trim().optional(),
    department: z.string().trim().optional(),
    departmentId: z.string().uuid().optional().nullable(),
    role: z.enum(["worker", "admin"]).default("worker"),
    checkInSessionId: z.string().uuid().optional(),
    checkInNote: z.string().trim().optional(),
});

export async function createWorkerAccount(formData: FormData) {
    const scope = await requireAdminAuth();
    if (!canManageWorkerAccess(scope)) {
        return { error: ADD_WORKER_RESTRICTED_MESSAGE };
    }

    const { isSuperAdmin, managedDepartmentIds, user: adminUser } = scope;
    const supabase = await createClient();
    const adminClient = createAdminClient();

    const rawData = {
        firstName: formData.get("firstName")?.toString() || "",
        lastName: formData.get("lastName")?.toString() || "",
        email: formData.get("email")?.toString() || "",
        phone: formData.get("phone")?.toString() || "",
        dateOfBirth: formData.get("dateOfBirth")?.toString() || "",
        department: formData.get("department")?.toString() || "",
        departmentId: formData.get("departmentId")?.toString() || undefined,
        role: formData.get("role")?.toString() || "worker",
        checkInSessionId: formData.get("checkInSessionId")?.toString() || undefined,
        checkInNote: formData.get("checkInNote")?.toString() || undefined,
    };

    const parsed = registerWorkerSchema.safeParse(rawData);
    if (!parsed.success) {
        const firstError = parsed.error.issues[0]?.message || "Invalid input data.";
        return { error: firstError };
    }

    const {
        firstName,
        lastName,
        email: userEmail,
        phone,
        dateOfBirth,
        checkInSessionId,
        checkInNote,
    } = parsed.data;
    let {
        department,
        departmentId,
        role,
    } = parsed.data;

    // Zero-Trust Rule: Department Heads can only create workers in their managed department and CANNOT elevate to Admin
    if (!isSuperAdmin) {
        if (departmentId && !managedDepartmentIds.includes(departmentId)) {
            return { error: "Forbidden: You can only create workers in your assigned department." };
        }
        if (!departmentId && managedDepartmentIds.length > 0) {
            departmentId = managedDepartmentIds[0];
        }
        role = "worker"; // Force worker role
    }

    let teamName = "General";
    let teamId: string | null = null;
    if (departmentId) {
        const { data: deptData } = await adminClient
            .from("departments")
            .select("team, name, team_id")
            .eq("id", departmentId)
            .maybeSingle();
        if (deptData?.team) teamName = deptData.team;
        if (deptData?.name) department = deptData.name;
        if (deptData?.team_id) teamId = deptData.team_id;
    }

    // Auto-generate sequential team Worker ID (GLOBE/{TEAM}/26/XXXX)
    const workerId = await generateTeamWorkerId(adminClient, teamName);

    const cleanPhone = phone ? phone.replace(/\D/g, "") : "";
    const birthDate = dateOfBirth ? validateDateOfBirth(dateOfBirth) : {};
    if (birthDate.error) {
        return { error: birthDate.error };
    }
    const generatedEmail = userEmail && userEmail.length > 0
        ? userEmail
        : `worker.${cleanPhone || Date.now()}.${Math.floor(Math.random() * 1000)}@harvestersng.org`;

    const randomPassword = `H@rvest_${Math.random().toString(36).slice(-8)}${Math.floor(Math.random() * 90 + 10)}`;

    try {
        const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
            email: generatedEmail,
            password: randomPassword,
            email_confirm: true,
            user_metadata: {
                first_name: firstName,
                last_name: lastName,
                phone: phone || null,
                date_of_birth: birthDate.dateOfBirth || null,
                department: department || null,
                team: teamName,
                role: role,
            },
        });

        if (createError || !newUser.user) {
            console.error("Error creating auth user:", createError);
            return { error: createError?.message || "Failed to create worker account." };
        }

        const userId = newUser.user.id;

        const { error: profileError } = await adminClient
            .from("profiles")
            .upsert({
                id: userId,
                first_name: firstName,
                last_name: lastName,
                phone: phone || null,
                date_of_birth: birthDate.dateOfBirth || null,
                department: department || null,
                department_id: departmentId || null,
                team: teamName,
                team_id: teamId,
                role: role,
                worker_id: workerId,
                updated_at: new Date().toISOString(),
            });

        if (profileError) {
            console.error("Error updating worker profile:", profileError);
            return { error: `Failed to save profile: ${profileError.message || profileError.details || "Database error"}` };
        }

        if (checkInSessionId) {
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
                        team: teamName,
                        status: "active",
                        check_in_lat: 0.0,
                        check_in_lng: 0.0,
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

export async function updateWorkerProfile(formData: FormData) {
    const scope = await requireAdminAuth();
    const { isSuperAdmin, isTeamAdmin, managedDepartmentIds } = scope;
    const adminSupabase = createAdminClient();

    const targetUserId = formData.get("targetUserId")?.toString();
    const firstName = formData.get("firstName")?.toString()?.trim();
    const lastName = formData.get("lastName")?.toString()?.trim();
    const workerId = formData.get("workerId")?.toString()?.trim();
    const departmentId = formData.get("departmentId")?.toString() || null;
    const departmentName = formData.get("department")?.toString() || null;
    const teamAdminTeamId = formData.get("teamAdminTeamId")?.toString() || null;
    const dateOfBirth = formData.get("dateOfBirth")?.toString() || "";
    let role = formData.get("role")?.toString() || "worker";
    if (!isEditableRole(role)) {
        return { error: "Invalid role selected." };
    }

    if (!targetUserId) return { error: "Target worker user ID is missing." };
    if (!firstName || firstName.length < 2) return { error: "First Name must be at least 2 characters." };
    if (!workerId || workerId.length < 3) return { error: "Worker ID cannot be empty." };
    const birthDate = dateOfBirth ? validateDateOfBirth(dateOfBirth) : {};
    if (birthDate.error) return { error: birthDate.error };

    // Fetch existing target profile to verify department boundaries
    const { data: targetProfile, error: targetError } = await adminSupabase
        .from("profiles")
        .select("id, department_id, role")
        .eq("id", targetUserId)
        .single();

    if (targetError || !targetProfile) {
        return { error: "Target worker profile not found." };
    }

    if (targetUserId === scope.user.id && role !== targetProfile.role) {
        return { error: "For security, you cannot change your own admin role." };
    }

    // Zero-Trust Boundary Checks for scoped admins.
    if (!isSuperAdmin) {
        if (!targetProfile.department_id || !managedDepartmentIds.includes(targetProfile.department_id)) {
            return { error: "Forbidden: You can only edit workers in your assigned department." };
        }
        if (!departmentId) {
            return { error: "Forbidden: Scoped admins must keep workers assigned to a managed department." };
        }
        if (departmentId && !managedDepartmentIds.includes(departmentId)) {
            return { error: "Forbidden: You can only move workers within your assigned departments." };
        }

        const targetRole = targetProfile.role || "worker";
        const canTeamAdminManageReportsRole = isTeamAdmin && ["worker", "reports_admin"].includes(targetRole);

        if (isTeamAdmin) {
            if (!["worker", "reports_admin"].includes(role)) {
                return { error: "Forbidden: Team Admins can only assign Worker or Reports Only Admin roles." };
            }
            if (!canTeamAdminManageReportsRole) {
                return { error: "Forbidden: You cannot edit another administrator's profile." };
            }
        } else {
            if (targetRole !== "worker") {
                return { error: "Forbidden: You cannot edit another administrator's profile." };
            }
            role = targetRole;
        }

        if (!isTeamAdmin && role !== targetRole) {
            return { error: "Forbidden: You cannot edit another administrator's profile." };
        }
    }

    const { data: existingWorker } = await adminSupabase
        .from("profiles")
        .select("id")
        .eq("worker_id", workerId)
        .neq("id", targetUserId)
        .maybeSingle();

    if (existingWorker) {
        return { error: `Worker ID "${workerId}" is already assigned to another worker.` };
    }

    const updatePayload: Record<string, unknown> = {
        first_name: firstName,
        last_name: lastName || "",
        worker_id: workerId,
        role: role,
        date_of_birth: birthDate.dateOfBirth || null,
        updated_at: new Date().toISOString(),
    };

    let teamName: string | undefined = undefined;
    let departmentTeamId: string | null = null;
    let selectedTeamId: string | null = null;
    const isSuperAdminDepartmentScopedReportsAdmin = isSuperAdmin && role === "reports_admin" && !!departmentId;
    if (departmentId) {
        const { data: dept } = await adminSupabase
            .from("departments")
            .select("team, team_id")
            .eq("id", departmentId)
            .maybeSingle();
        if (dept?.team) teamName = dept.team;
        if (dept?.team_id) {
            departmentTeamId = dept.team_id;
            if (!isSuperAdminDepartmentScopedReportsAdmin) {
                updatePayload.team_id = dept.team_id;
            }
        }
    }

    updatePayload.department_id = departmentId;
    updatePayload.department = departmentName;
    if (teamName && !isSuperAdminDepartmentScopedReportsAdmin) updatePayload.team = teamName;
    if (isSuperAdminDepartmentScopedReportsAdmin) {
        updatePayload.team_id = null;
        updatePayload.team = null;
    }

    if (isSuperAdmin && role === "team_admin") {
        if (!teamAdminTeamId) {
            return { error: "Please select the team this Team Admin should manage." };
        }

        const { data: team, error: teamError } = await adminSupabase
            .from("teams")
            .select("id, name")
            .eq("id", teamAdminTeamId)
            .eq("is_active", true)
            .maybeSingle();

        if (teamError || !team) {
            return { error: "Selected team was not found or is inactive." };
        }

        if (departmentTeamId && departmentTeamId !== team.id) {
            return { error: "A Team Admin's selected department must belong to the same team they manage." };
        }

        selectedTeamId = team.id;
        updatePayload.team_id = team.id;
        updatePayload.team = team.name;
    } else if (isSuperAdmin && !departmentId) {
        updatePayload.team_id = null;
        updatePayload.team = null;
    }

    const { error: updateError } = await adminSupabase
        .from("profiles")
        .update(updatePayload)
        .eq("id", targetUserId);

    if (updateError) {
        console.error("Error updating worker profile:", updateError);
        return { error: updateError.message || "Failed to update worker profile." };
    }

    if (role !== "worker") {
        const { error: headCleanupError } = await adminSupabase
            .from("departments")
            .update({ head_user_id: null })
            .eq("head_user_id", targetUserId);

        if (headCleanupError) {
            console.error("Error clearing department-head assignment after role change:", headCleanupError);
            return { error: "Profile updated, but failed to clear Department Head assignment. Please review departments." };
        }
    }

    if (isSuperAdmin) {
        if (role === "team_admin" && selectedTeamId) {
            const { error: deleteError } = await adminSupabase
                .from("team_admin_assignments")
                .delete()
                .eq("user_id", targetUserId);

            if (deleteError) {
                console.error("Error replacing team admin assignment:", deleteError);
                return { error: "Profile updated, but failed to replace Team Admin assignment." };
            }

            const { error: assignmentError } = await adminSupabase
                .from("team_admin_assignments")
                .insert({
                    user_id: targetUserId,
                    team_id: selectedTeamId,
                    assigned_by: scope.user.id,
                });

            if (assignmentError) {
                console.error("Error assigning team admin:", assignmentError);
                return { error: "Profile updated, but failed to assign Team Admin scope." };
            }
        } else {
            const { error: deleteError } = await adminSupabase
                .from("team_admin_assignments")
                .delete()
                .eq("user_id", targetUserId);

            if (deleteError) {
                console.error("Error removing team admin assignment:", deleteError);
                return { error: "Profile updated, but failed to remove Team Admin assignment." };
            }
        }
    } else if (isTeamAdmin && role !== "team_admin") {
        const { error: deleteError } = await adminSupabase
            .from("team_admin_assignments")
            .delete()
            .eq("user_id", targetUserId);

        if (deleteError) {
            console.error("Error clearing stale team admin assignment:", deleteError);
            return { error: "Profile updated, but failed to clear stale Team Admin assignment." };
        }
    }

    revalidatePath("/admin/workers");
    revalidatePath("/admin");
    revalidatePath("/admin/reports");
    revalidatePath("/admin/sessions");
    revalidatePath("/dashboard");

    return { success: true };
}

export async function removeWorkerProfile(targetUserId: string) {
    const scope = await requireAdminAuth();
    if (!scope.isSuperAdmin) {
        return { error: "Forbidden: Only Super Admins can remove workers." };
    }

    const parsedTargetUserId = z.string().uuid().safeParse(targetUserId);
    if (!parsedTargetUserId.success) {
        return { error: "Invalid worker selected." };
    }

    if (parsedTargetUserId.data === scope.user.id) {
        return { error: "You cannot remove your own account." };
    }

    const adminSupabase = createAdminClient();
    const { data: targetProfile, error: targetError } = await adminSupabase
        .from("profiles")
        .select("id, first_name, last_name, role, is_active")
        .eq("id", parsedTargetUserId.data)
        .maybeSingle();

    if (targetError || !targetProfile) {
        console.error("Error finding worker to remove:", targetError);
        return { error: "Worker profile not found." };
    }

    if (targetProfile.role !== "worker") {
        return { error: "Only worker profiles can be removed here. Demote admin-scoped users first." };
    }

    if (targetProfile.is_active === false) {
        return { error: "This worker has already been removed." };
    }

    const now = new Date().toISOString();

    const { error: updateError } = await adminSupabase
        .from("profiles")
        .update({
            is_active: false,
            removed_at: now,
            removed_by: scope.user.id,
            updated_at: now,
        })
        .eq("id", parsedTargetUserId.data)
        .eq("role", "worker")
        .neq("id", scope.user.id);

    if (updateError) {
        console.error("Error soft-removing worker profile:", updateError);
        return { error: "Failed to remove worker. Please try again." };
    }

    const { error: headCleanupError } = await adminSupabase
        .from("departments")
        .update({ head_user_id: null })
        .eq("head_user_id", parsedTargetUserId.data);

    if (headCleanupError) {
        console.error("Error clearing removed worker department-head assignment:", headCleanupError);
        return { error: "Worker removed, but failed to clear their department-head assignment. Please review departments." };
    }

    const { error: banError } = await adminSupabase.auth.admin.updateUserById(parsedTargetUserId.data, {
        ban_duration: "876000h",
    });

    if (banError) {
        console.error("Error banning removed worker auth account:", banError);
        return { error: "Worker removed from active records, but auth access could not be revoked. Please review the user in Supabase Auth." };
    }

    revalidatePath("/admin");
    revalidatePath("/admin/workers");
    revalidatePath("/admin/departments");
    revalidatePath("/admin/sessions");
    revalidatePath("/admin/reports");

    return {
        success: true,
        message: `${targetProfile.first_name} ${targetProfile.last_name || ""}`.trim() || "Worker",
    };
}
