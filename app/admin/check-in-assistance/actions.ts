"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminManagementAuth } from "@/lib/rbac";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { manualWorkerCheckIn } from "@/app/admin/sessions/actions";

const requestIdSchema = z.string().uuid("Invalid assistance request.");
const noteSchema = z.string().trim().max(500, "Note must be 500 characters or less.");
const resolutionSchema = z.object({
  requestId: requestIdSchema,
  status: z.enum(["resolved", "dismissed"]),
  resolutionNote: noteSchema.optional().nullable(),
});

function invalidateAssistanceViews() {
  revalidatePath("/admin/check-in-assistance");
  revalidatePath("/dashboard");
}

async function updateRequest(
  requestId: string,
  status: "acknowledged" | "resolved" | "dismissed" | "note",
  note?: string | null,
) {
  await requireAdminManagementAuth();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_check_in_assistance_request", {
    p_request_id: requestId,
    p_status: status,
    p_resolution_note: note?.trim() || null,
  });
  if (error) {
    console.error("[CheckInAssistance] Update failed", { code: error.code, message: error.message });
    return { error: error.code === "42501"
      ? "You do not have permission to update this request."
      : "Could not update this request. Please refresh and try again." };
  }
  invalidateAssistanceViews();
  return { success: true, status: String(data) };
}

export async function acknowledgeCheckInAssistance(requestId: string, leaderNote?: string) {
  const parsed = z.object({ requestId: requestIdSchema, note: noteSchema.optional() })
    .safeParse({ requestId, note: leaderNote });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const result = await updateRequest(parsed.data.requestId, "acknowledged", parsed.data.note);
  if (result.success && result.status !== "acknowledged") {
    return { error: "This request has already been closed. Refresh to see its outcome." };
  }
  return result;
}

export async function sendLeaderNote(requestId: string, note: string) {
  const parsed = z.object({
    requestId: requestIdSchema,
    note: noteSchema.min(2, "Please enter a note of at least two characters."),
  }).safeParse({ requestId, note });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  return updateRequest(parsed.data.requestId, "note", parsed.data.note);
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
  const note = parsed.data.resolutionNote || (parsed.data.status === "dismissed"
    ? "Request reviewed and dismissed by leader."
    : "Verified and resolved by leader.");
  const result = await updateRequest(parsed.data.requestId, parsed.data.status, note);
  if (result.success && result.status !== parsed.data.status) {
    return { error: "Another update has already closed this request. Refresh to see its outcome." };
  }
  return result;
}

/** A support request does not itself prove presence or authorize check-in. */
export async function verifyAndProxyCheckIn(requestId: string, resolutionNote?: string) {
  const parsed = z.object({ requestId: requestIdSchema, note: noteSchema.optional() })
    .safeParse({ requestId, note: resolutionNote });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const scope = await requireAdminManagementAuth();
  const adminSupabase = createAdminClient();
  const { data: request, error } = await adminSupabase
    .from("check_in_assistance_requests")
    .select("id, user_id, session_id, status")
    .eq("id", parsed.data.requestId)
    .maybeSingle();
  if (error || !request) return { error: "Assistance request not found." };

  if (!scope.isSuperAdmin) {
    const { data: profile } = await adminSupabase.from("profiles")
      .select("department_id, team_id").eq("id", request.user_id).maybeSingle();
    const hasDepartmentAccess = profile?.department_id
      && scope.managedDepartmentIds.includes(profile.department_id);
    const hasTeamAccess = profile?.team_id && scope.managedTeamIds.includes(profile.team_id);
    if (!hasDepartmentAccess && !hasTeamAccess) {
      return { error: "This request is outside your administrative scope." };
    }
  }
  if (request.status !== "open" && request.status !== "acknowledged") {
    return { error: "This request has already been closed. Refresh to see its outcome." };
  }
  const note = parsed.data.note || "Verified physical presence at venue and checked in by leader.";
  const checkInResult = await manualWorkerCheckIn({
    workerId: request.user_id,
    sessionId: request.session_id,
    note,
  });
  if (checkInResult.error && !checkInResult.error.toLowerCase().includes("already checked in")) {
    return { error: checkInResult.error };
  }

  // Attendance's database trigger resolves the request and clears its alerts.
  // Append the leader's note without replacing a concurrently changed status.
  const result = await updateRequest(parsed.data.requestId, "note", note);
  revalidatePath("/admin/sessions");
  if (result.success && result.status !== "resolved") {
    return { error: "Attendance was recorded, but this request has a different outcome. Refresh to review it." };
  }
  return result;
}
