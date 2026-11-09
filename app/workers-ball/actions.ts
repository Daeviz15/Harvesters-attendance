"use server";

import { z } from "zod";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { generateTeamWorkerId } from "@/lib/workerId";
import { sendWorkersBallGatePassEmail } from "@/lib/email";
import { parseOccupation } from "./occupation";
import crypto from "node:crypto";

// ─── Types ───────────────────────────────────────────────────────────────────

export type RegisterState = {
    error?: string;
    success?: boolean;
    registrationId?: string;
    attendanceCode?: string;
    firstName?: string;
    lastName?: string;
    department?: string;
    photoUrl?: string | null;
    /** True when this email/phone already has a seat. No registration details are returned. */
    alreadyRegistered?: boolean;
} | null;

// ─── Photo upload ─────────────────────────────────────────────────────────────
// The client shrinks photos to ~800px JPEG before sending, so they stay well
// under the 1MB server action body limit.
const MAX_PHOTO_BYTES = 900 * 1024;
const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

async function readPhoto(formData: FormData): Promise<{ file: File; ext: string } | { error: string } | null> {
    const photo = formData.get("photo");
    if (!(photo instanceof File) || photo.size === 0) return null;

    const ext = PHOTO_TYPES[photo.type];
    if (!ext) return { error: "Photo must be a JPEG, PNG or WebP image." };
    if (photo.size > MAX_PHOTO_BYTES) return { error: "Photo is too large. Please choose a smaller image." };

    // Check the file really is the image type it claims to be
    const head = new Uint8Array(await photo.slice(0, 12).arrayBuffer());
    const isJpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    const isPng  = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
    const isWebp = String.fromCharCode(...head.slice(0, 4)) === "RIFF" && String.fromCharCode(...head.slice(8, 12)) === "WEBP";
    if (!isJpeg && !isPng && !isWebp) return { error: "That file doesn't look like a valid image." };

    return { file: photo, ext };
}

async function uploadPhoto(
    adminClient: ReturnType<typeof createAdminClient>,
    photo: { file: File; ext: string },
    ownerId: string | null
): Promise<string | null> {
    const path = `${ownerId ?? "wab"}/wab-${crypto.randomUUID()}.${photo.ext}`;
    const { error } = await adminClient.storage
        .from("avatars")
        .upload(path, photo.file, { contentType: photo.file.type, upsert: false });
    if (error) {
        console.error("[WAB] Photo upload failed:", error);
        return null;
    }
    return adminClient.storage.from("avatars").getPublicUrl(path).data.publicUrl;
}

// ─── Validation ───────────────────────────────────────────────────────────────

const MONTH_MAX_DAYS: Record<number, number> = {
    1: 31, 2: 29, 3: 31, 4: 30, 5: 31, 6: 30,
    7: 31, 8: 31, 9: 30, 10: 31, 11: 30, 12: 31,
};

const registerSchema = z.object({
    firstName: z
        .string().trim()
        .min(2, "First name must be at least 2 characters.")
        .max(50, "First name cannot exceed 50 characters.")
        .regex(/^[a-zA-Z\s\-']+$/, "First name contains invalid characters."),
    lastName: z.string().trim().max(50).optional().default(""),
    email: z
        .string().trim()
        .email("Please enter a valid email address.")
        .max(254)
        .transform((v) => v.toLowerCase()),
    phone: z
        .string()
        .regex(/^\d{10}$/, "Phone number must be exactly 10 digits (e.g. 8012345678)."),
    birthdayMonth: z.coerce.number().int().min(1, "Invalid month.").max(12, "Invalid month."),
    birthdayDay:   z.coerce.number().int().min(1, "Invalid day.").max(31, "Invalid day."),
    departmentId: z.string().uuid("Please select a valid department."),
    wantsToPresent: z
        .string()
        .refine((v) => v === "yes" || v === "no", "Please answer the presentation question.")
        .transform((v) => v === "yes"),
    presentationDetails: z.string().trim().max(1000).optional().default(""),
}).refine(
    (data) => data.birthdayDay <= (MONTH_MAX_DAYS[data.birthdayMonth] ?? 31),
    { message: "That day does not exist in the selected month.", path: ["birthdayDay"] }
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateRegistrationId(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

async function uniqueRegistrationId(adminClient: ReturnType<typeof createAdminClient>): Promise<string> {
    for (let i = 0; i < 10; i++) {
        const id = generateRegistrationId();
        const { data } = await adminClient
            .from("workers_ball_registrations")
            .select("id")
            .eq("registration_id", id)
            .maybeSingle();
        if (!data) return id;
    }
    return crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
}

async function uniqueAttendanceCode(adminClient: ReturnType<typeof createAdminClient>): Promise<string> {
    for (let i = 0; i < 10; i++) {
        const code = Math.floor(10000 + Math.random() * 90000).toString();
        const { data } = await adminClient
            .from("workers_ball_registrations")
            .select("id")
            .eq("attendance_code", code)
            .maybeSingle();
        if (!data) return code;
    }
    return Math.floor(10000 + crypto.randomInt(90000)).toString();
}

// ─── Main action ──────────────────────────────────────────────────────────────

export async function registerForWorkersBall(
    _prev: RegisterState,
    formData: FormData
): Promise<RegisterState> {
    const rawData = {
        firstName:            formData.get("firstName") ?? "",
        lastName:             formData.get("lastName") ?? "",
        email:                formData.get("email") ?? "",
        phone:                (formData.get("phone") as string | null ?? "").replace(/\D/g, ""),
        birthdayMonth:        formData.get("birthdayMonth") ?? "",
        birthdayDay:          formData.get("birthdayDay") ?? "",
        departmentId:         formData.get("departmentId") ?? "",
        wantsToPresent:       formData.get("wantsToPresent") ?? "no",
        presentationDetails:  formData.get("presentationDetails") ?? "",
    };

    const parsed = registerSchema.safeParse(rawData);
    if (!parsed.success) {
        return { error: parsed.error.issues[0]?.message || "Please check your inputs." };
    }

    const {
        firstName, lastName, email, phone,
        birthdayMonth, birthdayDay,
        departmentId,
        wantsToPresent, presentationDetails,
    } = parsed.data;

    // "What do you do currently?" answers
    const occupationResult = parseOccupation(formData.get("occupation"));
    if ("error" in occupationResult) return { error: occupationResult.error };
    const occ = occupationResult.data;

    const fullPhone = `+234${phone}`;
    const adminClient = createAdminClient();

    const photo = await readPhoto(formData);
    if (photo && "error" in photo) return { error: photo.error };

    const supabase = await createClient();
    const { data: { user: loggedInUser } } = await supabase.auth.getUser();

    // ── 1. Already registered? → No second registration ─────────────────────
    // The seat is already reserved. We re-send the gate pass to the email ON FILE
    // (never to whatever was typed) and return no codes, so nobody can pull up
    // someone else's gate pass by entering their phone number or email.
    const existingCols = "id, email, registration_id, attendance_code, qr_token, first_name, last_name, department, team";
    const { data: existingByEmail } = await adminClient
        .from("workers_ball_registrations")
        .select(existingCols)
        .eq("email", email)
        .maybeSingle();

    const existingByPhone = existingByEmail ? null : (await adminClient
        .from("workers_ball_registrations")
        .select(existingCols)
        .eq("phone", fullPhone)
        .maybeSingle()).data;

    // A logged-in worker gets one seat, even if they type a different email/phone
    const existing = existingByEmail ?? existingByPhone ?? (loggedInUser ? (await adminClient
        .from("workers_ball_registrations")
        .select(existingCols)
        .eq("user_id", loggedInUser.id)
        .maybeSingle()).data : null);

    if (existing) {
        try {
            await sendWorkersBallGatePassEmail({
                toEmail: existing.email,
                firstName: existing.first_name,
                lastName: existing.last_name ?? "",
                registrationId: existing.registration_id,
                department: existing.department,
                team: existing.team,
                attendanceCode: existing.attendance_code,
                qrToken: existing.qr_token,
            });
        } catch (e) {
            console.error("[WAB] Re-send gate pass failed:", e);
        }
        return { alreadyRegistered: true, firstName };
    }

    // ── 2. Department lookup ──────────────────────────────────────────────────
    const { data: dept, error: deptError } = await adminClient
        .from("departments")
        .select("id, name, team, team_id, is_active")
        .eq("id", departmentId)
        .maybeSingle();

    if (deptError || !dept) return { error: "Selected department was not found." };
    if (!dept.is_active) return { error: "Selected department is not currently active." };

    // ── 3. Resolve user_id ────────────────────────────────────────────────────
    let resolvedUserId: string | null = null;
    let isNewWorker = false;
    // Profile photo to fill in if the worker has none yet (only for the logged-in user or a new account)
    let profileIdForAvatar: string | null = null;
    let existingAvatarUrl: string | null = null;

    if (loggedInUser) {
        const { data: me } = await adminClient
            .from("profiles")
            .select("avatar_url")
            .eq("id", loggedInUser.id)
            .maybeSingle();
        existingAvatarUrl = me?.avatar_url ?? null;
        if (!existingAvatarUrl) profileIdForAvatar = loggedInUser.id;

        resolvedUserId = loggedInUser.id;
        // Update profile with any corrected data
        await adminClient
            .from("profiles")
            .update({
                first_name: firstName,
                last_name: lastName || "",
                phone: fullPhone,
                department_id: dept.id,
                department: dept.name,
                team: dept.team,
                team_id: dept.team_id,
                updated_at: new Date().toISOString(),
            })
            .eq("id", loggedInUser.id);
    } else {
        // Check by phone in profiles
        const { data: profileByPhone } = await adminClient
            .from("profiles")
            .select("id")
            .eq("phone", fullPhone)
            .maybeSingle();

        if (profileByPhone) {
            resolvedUserId = profileByPhone.id;
        } else {
            isNewWorker = true;
        }
    }

    // ── 4. Create new worker account if needed ────────────────────────────────
    if (isNewWorker) {
        const randomPassword = `H@rv_${Math.random().toString(36).slice(-8)}${Math.floor(Math.random() * 90 + 10)}`;

        const { data: newAuth, error: authError } = await adminClient.auth.admin.createUser({
            email,
            password: randomPassword,
            email_confirm: true,
            user_metadata: {
                first_name: firstName,
                last_name: lastName,
                phone: fullPhone,
                department: dept.name,
                team: dept.team,
                role: "worker",
                onboarding_complete: true,
            },
        });

        if (authError || !newAuth.user) {
            const msg = (authError?.message ?? "").toLowerCase();
            if (msg.includes("already registered") || msg.includes("already exists") || msg.includes("duplicate")) {
                // Email already in auth — create WAB registration without user_id link
                // (the user can link their account later by logging in)
                resolvedUserId = null;
            } else {
                return { error: authError?.message || "Could not create your account. Please try again." };
            }
        } else {
            resolvedUserId = newAuth.user.id;
            profileIdForAvatar = resolvedUserId;
            const workerId = await generateTeamWorkerId(adminClient, dept.team);
            await adminClient
                .from("profiles")
                .upsert({
                    id: resolvedUserId,
                    first_name: firstName,
                    last_name: lastName || "",
                    phone: fullPhone,
                    department: dept.name,
                    department_id: dept.id,
                    team: dept.team,
                    team_id: dept.team_id,
                    role: "worker",
                    worker_id: workerId,
                    onboarding_complete: true,
                    updated_at: new Date().toISOString(),
                });
        }
    }

    // ── 5. Photo ──────────────────────────────────────────────────────────────
    let photoUrl: string | null = null;
    if (photo) {
        photoUrl = await uploadPhoto(adminClient, photo, resolvedUserId);
        if (photoUrl && profileIdForAvatar) {
            await adminClient.from("profiles").update({ avatar_url: photoUrl }).eq("id", profileIdForAvatar);
        }
    } else {
        photoUrl = existingAvatarUrl; // logged-in worker's existing profile photo
    }

    // ── 6. Generate credentials ───────────────────────────────────────────────
    const registrationId  = await uniqueRegistrationId(adminClient);
    const qrToken         = crypto.randomUUID();
    const attendanceCode  = await uniqueAttendanceCode(adminClient);

    // ── 7. Insert WAB registration ────────────────────────────────────────────
    const { error: insertError } = await adminClient
        .from("workers_ball_registrations")
        .insert({
            registration_id:        registrationId,
            user_id:                resolvedUserId,
            email,
            phone:                  fullPhone,
            first_name:             firstName,
            last_name:              lastName || "",
            birthday_month:         birthdayMonth,
            birthday_day:           birthdayDay,
            department:             dept.name,
            department_id:          dept.id,
            team:                   dept.team,
            occupation:             occ.occupation,
            occupation_stages:      occ.stages,
            wants_to_connect:       occ.wantsToConnect,
            wants_job_offers:       occ.wantsJobOffers,
            open_to_mentoring:      occ.openToMentoring,
            wants_to_present:       wantsToPresent,
            presentation_details:   wantsToPresent ? (presentationDetails || null) : null,
            attendance_code:        attendanceCode,
            qr_token:               qrToken,
            photo_url:              photoUrl,
        });

    if (insertError) {
        console.error("[WAB] Insert error:", insertError);
        if (insertError.code === "23505") {
            // Lost a race with a simultaneous submit (e.g. double tap) — the seat exists
            if (insertError.message.includes("wab_one_seat_per_")) {
                return { alreadyRegistered: true, firstName };
            }
            // Rare registration ID / code collision — safe to just try again
            return { error: "Something went wrong saving your registration. Please submit again." };
        }
        return { error: "Registration could not be saved. Please try again." };
    }

    // ── 8. Send gate pass email ───────────────────────────────────────────────
    try {
        await sendWorkersBallGatePassEmail({
            toEmail: email,
            firstName,
            lastName: lastName || "",
            registrationId,
            department: dept.name,
            team: dept.team,
            attendanceCode,
            qrToken,
        });
    } catch (emailErr) {
        console.error("[WAB] Gate pass email failed:", emailErr);
        // Non-fatal — registration is saved
    }

    return {
        success: true,
        registrationId,
        attendanceCode,
        firstName,
        lastName: lastName || "",
        department: dept.name,
        photoUrl,
    };
}
