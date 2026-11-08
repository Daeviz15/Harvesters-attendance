"use server";

import { z } from "zod";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireWabCheckinAccess } from "@/lib/rbac";

export type CheckInState = {
    error?: string;
    notFound?: boolean;
    alreadyCheckedIn?: boolean;
    success?: boolean;
    attendee?: {
        id: string;
        name: string;
        department: string;
        team: string | null;
        registrationId: string;
        attendingWithPartner?: boolean;
        checkedInAt?: string;
    };
} | null;

const codeSchema = z.string().regex(/^\d{5}$/, "Please enter a valid 5-digit code.");
const tokenSchema = z.string().uuid("Invalid QR token.");

async function findRegistration(filter: { attendance_code?: string; qr_token?: string }) {
    const adminClient = createAdminClient();
    const query = adminClient
        .from("workers_ball_registrations")
        .select("id, registration_id, first_name, last_name, department, team, attending_with_partner, is_checked_in, checked_in_at, attendance_code, qr_token");

    const { data, error } = filter.attendance_code
        ? await query.eq("attendance_code", filter.attendance_code).maybeSingle()
        : await query.eq("qr_token", filter.qr_token!).maybeSingle();

    return { data, error };
}

export async function lookupByCode(
    _prev: CheckInState,
    formData: FormData
): Promise<CheckInState> {
    await requireWabCheckinAccess();

    const code = formData.get("code")?.toString().trim() ?? "";
    const parsed = codeSchema.safeParse(code);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message };

    const { data, error } = await findRegistration({ attendance_code: parsed.data });
    if (error) return { error: "Database error. Please try again." };
    if (!data) return { notFound: true };

    return {
        attendee: {
            id: data.id,
            name: `${data.first_name} ${data.last_name ?? ""}`.trim(),
            department: data.department,
            team: data.team,
            registrationId: data.registration_id,
            attendingWithPartner: data.attending_with_partner ?? false,
            checkedInAt: data.checked_in_at ?? undefined,
        },
        alreadyCheckedIn: data.is_checked_in,
    };
}

export async function lookupByToken(token: string): Promise<CheckInState> {
    await requireWabCheckinAccess();

    const parsed = tokenSchema.safeParse(token);
    if (!parsed.success) return { notFound: true };

    const { data, error } = await findRegistration({ qr_token: parsed.data });
    if (error) return { error: "Database error. Please try again." };
    if (!data) return { notFound: true };

    return {
        attendee: {
            id: data.id,
            name: `${data.first_name} ${data.last_name ?? ""}`.trim(),
            department: data.department,
            team: data.team,
            registrationId: data.registration_id,
            attendingWithPartner: data.attending_with_partner ?? false,
            checkedInAt: data.checked_in_at ?? undefined,
        },
        alreadyCheckedIn: data.is_checked_in,
    };
}

export async function confirmCheckIn(registrationDbId: string): Promise<CheckInState> {
    await requireWabCheckinAccess();

    const parsed = z.string().uuid().safeParse(registrationDbId);
    if (!parsed.success) return { error: "Invalid registration ID." };

    const adminClient = createAdminClient();

    // Atomic update — only succeeds if not yet checked in (prevents race conditions)
    const { data, error } = await adminClient
        .from("workers_ball_registrations")
        .update({ is_checked_in: true, checked_in_at: new Date().toISOString() })
        .eq("id", parsed.data)
        .eq("is_checked_in", false)
        .select("first_name, last_name, department, team, registration_id, attending_with_partner, checked_in_at")
        .maybeSingle();

    if (error) return { error: "Check-in could not be recorded. Please try again." };

    if (!data) {
        // No rows updated — attendee was already checked in by another device
        const { data: existing } = await adminClient
            .from("workers_ball_registrations")
            .select("first_name, last_name, department, team, registration_id, attending_with_partner, checked_in_at")
            .eq("id", parsed.data)
            .single();

        return {
            alreadyCheckedIn: true,
            attendee: existing
                ? {
                    id: parsed.data,
                    name: `${existing.first_name} ${existing.last_name ?? ""}`.trim(),
                    department: existing.department,
                    team: existing.team,
                    registrationId: existing.registration_id,
                    attendingWithPartner: existing.attending_with_partner ?? false,
                    checkedInAt: existing.checked_in_at ?? undefined,
                }
                : undefined,
        };
    }

    return {
        success: true,
        attendee: {
            id: parsed.data,
            name: `${data.first_name} ${data.last_name ?? ""}`.trim(),
            department: data.department,
            team: data.team,
            registrationId: data.registration_id,
            attendingWithPartner: data.attending_with_partner ?? false,
            checkedInAt: data.checked_in_at ?? undefined,
        },
    };
}
