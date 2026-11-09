"use server";

import { z } from "zod";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireWabCheckinAccess } from "@/lib/rbac";

// Each gate pass admits exactly ONE person, ONCE. The first confirmed scan/code
// entry marks it used; every later scan or code entry shows "already used".

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
        checkedInAt?: string;
        checkedInByName?: string | null;
    };
} | null;

const codeSchema = z.string().regex(/^\d{5}$/, "Please enter a valid 5-digit code.");
const tokenSchema = z.string().uuid("Invalid QR token.");

const COLS = "id, registration_id, first_name, last_name, department, team, is_checked_in, checked_in_at, checked_in_by";

type Row = {
    id: string; registration_id: string; first_name: string; last_name: string | null;
    department: string; team: string | null; is_checked_in: boolean; checked_in_at: string | null; checked_in_by: string | null;
};

async function staffName(adminClient: ReturnType<typeof createAdminClient>, userId: string | null) {
    if (!userId) return null;
    const { data } = await adminClient.from("profiles").select("first_name, last_name").eq("id", userId).maybeSingle();
    return data ? `${data.first_name ?? ""} ${data.last_name ?? ""}`.trim() || null : null;
}

async function toState(adminClient: ReturnType<typeof createAdminClient>, row: Row, extra: Partial<NonNullable<CheckInState>> = {}): Promise<CheckInState> {
    return {
        ...extra,
        alreadyCheckedIn: extra.success ? undefined : row.is_checked_in,
        attendee: {
            id: row.id,
            name: `${row.first_name} ${row.last_name ?? ""}`.trim(),
            department: row.department,
            team: row.team,
            registrationId: row.registration_id,
            checkedInAt: row.checked_in_at ?? undefined,
            checkedInByName: row.is_checked_in ? await staffName(adminClient, row.checked_in_by) : null,
        },
    };
}

async function lookup(filter: { attendance_code: string } | { qr_token: string }): Promise<CheckInState> {
    const adminClient = createAdminClient();
    const query = adminClient.from("workers_ball_registrations").select(COLS);
    const { data, error } = "attendance_code" in filter
        ? await query.eq("attendance_code", filter.attendance_code).maybeSingle<Row>()
        : await query.eq("qr_token", filter.qr_token).maybeSingle<Row>();

    if (error) return { error: "Database error. Please try again." };
    if (!data) return { notFound: true };
    return toState(adminClient, data);
}

export async function lookupByCode(_prev: CheckInState, formData: FormData): Promise<CheckInState> {
    await requireWabCheckinAccess();

    const parsed = codeSchema.safeParse(formData.get("code")?.toString().trim() ?? "");
    if (!parsed.success) return { error: parsed.error.issues[0]?.message };
    return lookup({ attendance_code: parsed.data });
}

export async function lookupByToken(token: string): Promise<CheckInState> {
    await requireWabCheckinAccess();

    const parsed = tokenSchema.safeParse(token);
    if (!parsed.success) return { notFound: true };
    return lookup({ qr_token: parsed.data });
}

export async function confirmCheckIn(registrationDbId: string): Promise<CheckInState> {
    const staff = await requireWabCheckinAccess();

    const parsed = z.string().uuid().safeParse(registrationDbId);
    if (!parsed.success) return { error: "Invalid registration ID." };

    const adminClient = createAdminClient();

    // Atomic: only succeeds while the ticket is unused, so two devices
    // scanning the same pass at the same moment can't both admit someone.
    const { data, error } = await adminClient
        .from("workers_ball_registrations")
        .update({ is_checked_in: true, checked_in_at: new Date().toISOString(), checked_in_by: staff.userId })
        .eq("id", parsed.data)
        .eq("is_checked_in", false)
        .select(COLS)
        .maybeSingle<Row>();

    if (error) return { error: "Check-in could not be recorded. Please try again." };
    if (data) return toState(adminClient, data, { success: true });

    // Nothing updated — this ticket was already used
    const { data: existing } = await adminClient
        .from("workers_ball_registrations")
        .select(COLS)
        .eq("id", parsed.data)
        .maybeSingle<Row>();

    return existing ? toState(adminClient, existing) : { notFound: true };
}
