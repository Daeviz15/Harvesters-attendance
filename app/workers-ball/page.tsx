import type { Metadata } from "next";
import { Bebas_Neue, Playfair_Display, Oswald, Archivo_Black } from "next/font/google";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import WorkersBallClient from "./WorkersBallClient";

// ── Ball-specific fonts (ball.json typography spec) ───────────────────────────
const bebas    = Bebas_Neue({ weight: "400",             subsets: ["latin"], variable: "--font-bebas",    display: "swap" });
const playfair = Playfair_Display({                       subsets: ["latin"], variable: "--font-playfair", display: "swap", style: ["normal", "italic"] });
const oswald   = Oswald({ weight: ["500", "600", "700"], subsets: ["latin"], variable: "--font-oswald",   display: "swap" });
const archivo  = Archivo_Black({ weight: "400",           subsets: ["latin"], variable: "--font-archivo",  display: "swap" });

export const metadata: Metadata = {
    title: "Workers Ball 2026 | Harvesters Globe Ologolo",
    description:
        "An evening of light, elegance and celebration. Register for the Harvesters Globe Ologolo Workers Ball 2026 — 22nd November, 4PM.",
    openGraph: {
        title: "Workers Ball 2026 — Harvesters Globe Ologolo",
        description: "Celebrating the workers who light up our Globe. 22nd November 2026, 4PM.",
        images: [{ url: "/ball.png", width: 1024, height: 1280, alt: "Workers Ball 2026 flyer" }],
    },
};

export default async function WorkersBallPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
    const { reason } = await searchParams;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Fetch active departments for form dropdown
    const { data: departments } = await supabase
        .from("departments")
        .select("id, name, team, team_id")
        .eq("is_active", true)
        .order("team")
        .order("name");

    // Autopopulate if logged in
    let profile: {
        first_name: string | null;
        last_name: string | null;
        phone: string | null;
        department_id: string | null;
        avatar_url: string | null;
        date_of_birth: string | null;
    } | null = null;

    let existingWabRegistration: {
        registration_id: string;
        attendance_code: string | null;
        first_name: string;
        last_name: string | null;
        department: string;
        photo_url: string | null;
    } | null = null;

    if (user) {
        const { data } = await supabase
            .from("profiles")
            .select("first_name, last_name, phone, department_id, avatar_url, date_of_birth")
            .eq("id", user.id)
            .maybeSingle();
        profile = data;

        const adminClient = createAdminClient();
        const { data: wabData } = await adminClient
            .from("workers_ball_registrations")
            .select("registration_id, attendance_code, first_name, last_name, department, photo_url")
            .eq("user_id", user.id)
            .maybeSingle();
        existingWabRegistration = wabData
            ? { ...wabData, photo_url: wabData.photo_url ?? profile?.avatar_url ?? null }
            : null;
    }

    const rawPhone = profile?.phone ?? "";
    const normalizedPhone = rawPhone.startsWith("+234")
        ? rawPhone.slice(4)
        : rawPhone.replace(/^\+?234/, "").replace(/\D/g, "");

    // date_of_birth is "YYYY-MM-DD" — only month and day are used
    const dob = /^\d{4}-(\d{2})-(\d{2})/.exec(profile?.date_of_birth ?? "");
    const birthdayMonth = dob ? Number(dob[1]) : null;
    const birthdayDay = dob ? Number(dob[2]) : null;

    const fontVars =`${bebas.variable} ${playfair.variable} ${oswald.variable} ${archivo.variable}`;

    return (
        <WorkersBallClient
            fontVars={fontVars}
            departments={(departments ?? []).map((d) => ({
                id: d.id,
                name: d.name,
                team: d.team ?? "General",
                teamId: d.team_id ?? null,
            }))}
            initialData={
                user
                    ? {
                        email: user.email ?? "",
                        firstName: profile?.first_name ?? "",
                        lastName: profile?.last_name ?? "",
                        phone: normalizedPhone,
                        departmentId: profile?.department_id ?? "",
                        avatarUrl: profile?.avatar_url ?? null,
                        birthdayMonth,
                        birthdayDay,
                    }
                    : null
            }
            isLoggedIn={!!user}
            existingRegistration={existingWabRegistration}
            noFrontDeskAccess={reason === "no_front_desk_access"}
        />
    );
}
