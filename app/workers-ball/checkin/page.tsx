import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireWabCheckinAccess } from "@/lib/rbac";
import { createClient } from "@/utils/supabase/server";
import { lookupByToken } from "./actions";
import CheckInClient from "./CheckInClient";

export const metadata: Metadata = {
    title: "WAB 2026 — Event Check-in",
    description: "Workers' Ball 2026 event-day attendance check-in.",
};

interface Props {
    searchParams: Promise<{ token?: string }>;
}

export default async function WorkersBallCheckinPage({ searchParams }: Props) {
    const params = await searchParams;
    const token = typeof params.token === "string" ? params.token.trim() : null;

    // Admins, or workers with front desk access that hasn't expired.
    // Not logged in → login, then straight back here (keeping a scanned QR token).
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        const back = token ? `/workers-ball/checkin?token=${encodeURIComponent(token)}` : "/workers-ball/checkin";
        redirect(`/auth/login?next=${encodeURIComponent(back)}`);
    }
    await requireWabCheckinAccess();

    let preloaded = null;
    if (token) {
        preloaded = await lookupByToken(token);
    }

    return <CheckInClient preloaded={preloaded} preloadedToken={token} />;
}
