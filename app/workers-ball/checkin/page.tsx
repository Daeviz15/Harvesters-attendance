import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireWabCheckinAccess } from "@/lib/rbac";
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
    // Accepts: admin, super_admin, team_admin, front_desk
    try {
        await requireWabCheckinAccess();
    } catch {
        redirect("/auth/login?redirectTo=/workers-ball/checkin");
    }

    const params = await searchParams;
    const token = typeof params.token === "string" ? params.token.trim() : null;

    let preloaded = null;
    if (token) {
        preloaded = await lookupByToken(token);
    }

    return <CheckInClient preloaded={preloaded} preloadedToken={token} />;
}
