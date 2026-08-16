"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminManagementAuth as requireAdminAuth } from "@/lib/rbac";
import { createClient } from "@/utils/supabase/server";
import type { LeaveStatus } from "@/lib/types";

const PAGE_SIZE = 25;

const reviewSchema = z.object({
    requestId: z.string().uuid("Invalid leave request."),
    status: z.enum(["approved", "rejected"]),
    reviewNote: z.string().trim().max(500, "Review note cannot exceed 500 characters.").optional(),
});

export interface AdminLeaveRequestRow {
    id: string;
    user_id: string;
    leave_type: string;
    start_date: string;
    end_date: string;
    reason: string;
    status: LeaveStatus;
    created_at: string;
    reviewed_at: string | null;
    review_note: string | null;
    requester: {
        id: string;
        first_name: string;
        last_name: string;
        department: string | null;
        department_id: string | null;
        team: string | null;
        team_id: string | null;
        worker_id: string | null;
        avatar_url: string | null;
    } | null;
    reviewer: {
        id: string;
        first_name: string;
        last_name: string;
    } | null;
}

export interface LeaveRequestsResult {
    requests: AdminLeaveRequestRow[];
    totalCount: number;
    page: number;
    pageSize: number;
}

function getStringParam(
    searchParams: { [key: string]: string | string[] | undefined },
    key: string,
    fallback = "",
) {
    const value = searchParams[key];
    return typeof value === "string" ? value : fallback;
}

function sanitizeSearch(value: string) {
    return value.replace(/[,()%_*]/g, " ").trim().slice(0, 80);
}

function normalizeStatus(value: string): LeaveStatus | "all" {
    return value === "pending" || value === "approved" || value === "rejected" ? value : "all";
}

export async function getAdminLeaveRequests(
    searchParams: { [key: string]: string | string[] | undefined },
): Promise<{ data?: LeaveRequestsResult; error?: string }> {
    await requireAdminAuth();

    const supabase = await createClient();
    const parsedPage = Number.parseInt(getStringParam(searchParams, "page", "1"), 10);
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const status = normalizeStatus(getStringParam(searchParams, "status", "pending"));
    const search = sanitizeSearch(getStringParam(searchParams, "search", ""));
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let matchingProfileIds: string[] | null = null;
    if (search) {
        const { data: matchingProfiles, error: searchError } = await supabase
            .from("profiles")
            .select("id")
            .or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,department.ilike.%${search}%,team.ilike.%${search}%,worker_id.ilike.%${search}%`);

        if (searchError) {
            console.error("[LeaveRequests] Failed to search scoped profiles:", searchError);
            return { error: "Could not search leave requests." };
        }

        matchingProfileIds = (matchingProfiles || []).map((profile) => profile.id);
        if (matchingProfileIds.length === 0) {
            return {
                data: {
                    requests: [],
                    totalCount: 0,
                    page,
                    pageSize: PAGE_SIZE,
                },
            };
        }
    }

    let query = supabase
        .from("leave_requests")
        .select(
            "id, user_id, leave_type, start_date, end_date, reason, status, created_at, reviewed_at, review_note, reviewed_by",
            { count: "exact" },
        );

    if (status !== "all") {
        query = query.eq("status", status);
    }

    if (matchingProfileIds) {
        query = query.in("user_id", matchingProfileIds);
    }

    const leaveResponse = await query
        .order("created_at", { ascending: false })
        .range(from, to);

    if (leaveResponse.error) {
        console.error("[LeaveRequests] Failed to fetch scoped leave requests:", leaveResponse.error);
        return { error: "Could not load leave requests." };
    }

    type LeaveRow = {
        id: string;
        user_id: string;
        leave_type: string;
        start_date: string;
        end_date: string;
        reason: string;
        status: LeaveStatus;
        created_at: string;
        reviewed_at: string | null;
        review_note: string | null;
        reviewed_by: string | null;
    };

    const rows = (leaveResponse.data || []) as LeaveRow[];
    const relatedProfileIds = Array.from(new Set(
        rows.flatMap((row) => [row.user_id, row.reviewed_by]).filter((value): value is string => Boolean(value)),
    ));

    const profilesById = new Map<string, AdminLeaveRequestRow["requester"]>();
    if (relatedProfileIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
            .from("profiles")
            .select("id, first_name, last_name, department, department_id, team, team_id, worker_id, avatar_url")
            .in("id", relatedProfileIds);

        if (profilesError) {
            console.error("[LeaveRequests] Failed to fetch leave request profiles:", profilesError);
            return { error: "Could not load leave request worker details." };
        }

        for (const profile of profiles || []) {
            profilesById.set(profile.id, profile);
        }
    }

    return {
        data: {
            requests: rows.map((row) => {
                const reviewerProfile = row.reviewed_by ? profilesById.get(row.reviewed_by) : null;
                return {
                    id: row.id,
                    user_id: row.user_id,
                    leave_type: row.leave_type,
                    start_date: row.start_date,
                    end_date: row.end_date,
                    reason: row.reason,
                    status: row.status,
                    created_at: row.created_at,
                    reviewed_at: row.reviewed_at,
                    review_note: row.review_note,
                    requester: profilesById.get(row.user_id) || null,
                    reviewer: reviewerProfile
                        ? {
                            id: reviewerProfile.id,
                            first_name: reviewerProfile.first_name,
                            last_name: reviewerProfile.last_name,
                        }
                        : null,
                };
            }),
            totalCount: leaveResponse.count || 0,
            page,
            pageSize: PAGE_SIZE,
        },
    };
}

export async function reviewLeaveRequest(formData: FormData) {
    await requireAdminAuth();

    const parsed = reviewSchema.safeParse({
        requestId: formData.get("requestId"),
        status: formData.get("status"),
        reviewNote: formData.get("reviewNote") || undefined,
    });

    if (!parsed.success) {
        return { error: parsed.error.issues[0]?.message || "Invalid review request." };
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc("review_leave_request", {
        p_leave_request_id: parsed.data.requestId,
        p_status: parsed.data.status,
        p_review_note: parsed.data.reviewNote || null,
    });

    if (error) {
        console.error("[LeaveRequests] Review failed:", error);
        return { error: error.message || "Could not update leave request." };
    }

    revalidatePath("/admin/leave-requests");
    revalidatePath("/dashboard");
    return { success: true };
}
