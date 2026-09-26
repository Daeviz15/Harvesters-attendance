"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminManagementAuth } from "@/lib/rbac";
import { createAdminClient } from "@/utils/supabase/admin";
import { manualWorkerCheckIn } from "@/app/admin/sessions/actions";

const requestIdSchema = z.string().uuid("Invalid assistance request.");
const resolutionSchema = z.object({
  requestId: z.string().uuid("Invalid assistance request."),
  status: z.enum(["resolved", "dismissed"]),
  resolutionNote: z.string().trim().max(500).optional().nullable(),
});

type AdminScope = Awaited<ReturnType<typeof requireAdminManagementAuth>>;

/**
 * Validates existence and verifies that the actor has permission over the target worker's department or team.
 */
async function checkWorkerAssistanceScope(
  adminSupabase: ReturnType<typeof createAdminClient>,
  scope: AdminScope,
  requestId: string
): Promise<{ error?: string; request?: { id: string; user_id: string; session_id: string; status: string } }> {
  const { data: request, error: fetchErr } = await adminSupabase
    .from("check_in_assistance_requests")
    .select("id, user_id, session_id, status")
    .eq("id", requestId)
    .single();

  if (fetchErr || !request) {
    return { error: "Assistance request not found." };
  }

  if (scope.isSuperAdmin) {
    return { request };
  }

  const { data: profile } = await adminSupabase
    .from("profiles")
    .select("department_id, team_id")
    .eq("id", request.user_id)
    .single();

  const hasDeptAccess = profile?.department_id && scope.managedDepartmentIds.includes(profile.department_id);
  const hasTeamAccess = profile?.team_id && scope.managedTeamIds.includes(profile.team_id);

  if (!hasDeptAccess && !hasTeamAccess) {
    return { error: "This request is outside your administrative scope." };
  }

  return { request };
}

export async function acknowledgeCheckInAssistance(requestId: string, leaderNote?: string) {
  const parsedId = requestIdSchema.safeParse(requestId);
  if (!parsedId.success) return { error: parsedId.error.issues[0]?.message };

  const scope = await requireAdminManagementAuth();
  const adminSupabase = createAdminClient();

  const authCheck = await checkWorkerAssistanceScope(adminSupabase, scope, parsedId.data);
  if (authCheck.error) return { error: authCheck.error };

  const updatePayload: Record<string, unknown> = {
    status: "acknowledged",
    acknowledged_by: scope.user.id,
    acknowledged_at: new Date().toISOString(),
  };

  const cleanNote = leaderNote?.trim();
  if (cleanNote) {
    updatePayload.resolution_note = cleanNote;
  }

  const { error } = await adminSupabase
    .from("check_in_assistance_requests")
    .update(updatePayload)
    .eq("id", parsedId.data);

  if (error) {
    console.error("[CheckInAssistance] Acknowledge failed", error);
    return { error: "Could not acknowledge this request. Please try again." };
  }

  revalidatePath("/admin/check-in-assistance");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function sendLeaderNote(requestId: string, note: string) {
  const parsedId = requestIdSchema.safeParse(requestId);
  if (!parsedId.success) return { error: parsedId.error.issues[0]?.message };

  const cleanNote = note?.trim();
  if (!cleanNote || cleanNote.length < 2) {
    return { error: "Please enter a valid note to send to the worker." };
  }
  if (cleanNote.length > 500) {
    return { error: "Note must be 500 characters or less." };
  }

  const scope = await requireAdminManagementAuth();
  const adminSupabase = createAdminClient();

  const authCheck = await checkWorkerAssistanceScope(adminSupabase, scope, parsedId.data);
  if (authCheck.error) return { error: authCheck.error };

  const { error } = await adminSupabase
    .from("check_in_assistance_requests")
    .update({
      resolution_note: cleanNote,
      acknowledged_by: scope.user.id,
      acknowledged_at: new Date().toISOString(),
    })
    .eq("id", parsedId.data);

  if (error) {
    console.error("[CheckInAssistance] Send note failed", error);
    return { error: "Could not send note to worker. Please try again." };
  }

  revalidatePath("/admin/check-in-assistance");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function closeCheckInAssistance(formData: FormData) {
  const parsed = resolutionSchema.safeParse({
    requestId: formData.get("requestId"),
    status: formData.get("status"),
    resolutionNote: formData.get("resolutionNote"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Check the resolution details." };
  }

  const scope = await requireAdminManagementAuth();
  const adminSupabase = createAdminClient();

  const authCheck = await checkWorkerAssistanceScope(adminSupabase, scope, parsed.data.requestId);
  if (authCheck.error) return { error: authCheck.error };

  const defaultNote = parsed.data.status === "dismissed"
    ? "Request reviewed & dismissed by leader"
    : "Verified and resolved by Leader";
  const note = parsed.data.resolutionNote?.trim() || defaultNote;

  const { error } = await adminSupabase
    .from("check_in_assistance_requests")
    .update({
      status: parsed.data.status,
      resolved_by: scope.user.id,
      resolved_at: new Date().toISOString(),
      resolution_note: note,
    })
    .eq("id", parsed.data.requestId);

  if (error) {
    console.error("[CheckInAssistance] Close failed", error);
    return { error: "Could not update this request. Please try again." };
  }

  revalidatePath("/admin/check-in-assistance");
  revalidatePath("/dashboard");
  return { success: true, status: parsed.data.status };
}

/**
 * Verifies a worker's physical presence at church, proxy checks them into the session,
 * and marks the assistance request as resolved with an audited leader note.
 */
export async function verifyAndProxyCheckIn(requestId: string, resolutionNote?: string) {
  const parsedId = requestIdSchema.safeParse(requestId);
  if (!parsedId.success) return { error: parsedId.error.issues[0]?.message };

  const scope = await requireAdminManagementAuth();
  const adminSupabase = createAdminClient();

  const authCheck = await checkWorkerAssistanceScope(adminSupabase, scope, parsedId.data);
  if (authCheck.error || !authCheck.request) return { error: authCheck.error || "Assistance request not found." };
  const request = authCheck.request;

  const note = resolutionNote?.trim() || "Verified physical presence at venue & checked in by Leader";

  // Perform manual proxy check-in
  const checkInResult = await manualWorkerCheckIn({
    workerId: request.user_id,
    sessionId: request.session_id,
    note,
  });

  if (checkInResult.error && !checkInResult.error.toLowerCase().includes("already checked in")) {
    return { error: checkInResult.error };
  }

  // Mark assistance request as resolved with the note
  const { error: updateError } = await adminSupabase
    .from("check_in_assistance_requests")
    .update({
      status: "resolved",
      resolved_by: scope.user.id,
      resolved_at: new Date().toISOString(),
      resolution_note: note,
    })
    .eq("id", parsedId.data);

  if (updateError) {
    console.error("[CheckInAssistance] Resolve update error:", updateError);
  }

  revalidatePath("/admin/check-in-assistance");
  revalidatePath("/admin/sessions");
  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * Removes completed (resolved, dismissed, expired) assistance requests from the database
 * to prevent clutter.
 */
export async function clearFinishedCheckInAssistance() {
  const scope = await requireAdminManagementAuth();

  if (!scope.isSuperAdmin) {
    return { error: "Only Super Admins can clear finished assistance requests." };
  }

  try {
    const adminSupabase = createAdminClient();
    const { data, error } = await adminSupabase
      .from("check_in_assistance_requests")
      .delete()
      .in("status", ["resolved", "dismissed", "expired"])
      .select("id");

    if (error) {
      console.error("[CheckInAssistance] Clear finished requests error:", error);
      return { error: "Failed to clear finished requests." };
    }

    revalidatePath("/admin/check-in-assistance");
    return { success: true, count: data?.length ?? 0 };
  } catch (err: unknown) {
    console.error("[CheckInAssistance] Clear finished requests exception:", err);
    return { error: "Failed to clear finished requests." };
  }
}
