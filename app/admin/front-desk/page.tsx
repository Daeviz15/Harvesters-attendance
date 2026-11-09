import { requireSuperAdminAuth } from "@/lib/rbac";
import { createAdminClient } from "@/utils/supabase/admin";
import FrontDeskClient from "./FrontDeskClient";

export const metadata = {
    title: "Ball Front Desk | Admin Portal",
};
export const dynamic = "force-dynamic";

export default async function FrontDeskPage() {
    await requireSuperAdminAuth();
    const admin = createAdminClient();
    const [staffRes, workersRes, statsRes] = await Promise.all([
        admin
            .from("profiles")
            .select("id, first_name, last_name, worker_id, department")
            .eq("wab_front_desk", true)
            .order("first_name", { ascending: true }),
        admin
            .from("profiles")
            .select("id, first_name, last_name, worker_id, department")
            .eq("is_active", true)
            .order("first_name", { ascending: true }),
        admin
            .from("workers_ball_registrations")
            .select("is_checked_in"),
    ]);

    const registrations = statsRes.data ?? [];

    return (
        <FrontDeskClient
            staff={(staffRes.data ?? []).map((s) => ({ ...s, last_name: s.last_name ?? "", worker_id: s.worker_id ?? "" }))}
            workers={(workersRes.data ?? []).map((w) => ({ ...w, last_name: w.last_name ?? "", worker_id: w.worker_id ?? "" }))}
            registeredCount={registrations.length}
            admittedCount={registrations.filter((r) => r.is_checked_in).length}
            loadError={!!(staffRes.error || workersRes.error)}
        />
    );
}
