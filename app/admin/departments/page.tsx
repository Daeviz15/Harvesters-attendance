import { createClient } from "@/utils/supabase/server";
import { requireAdminAuth } from "@/lib/rbac";
import DepartmentsClient from "./DepartmentsClient";
import { redirect } from "next/navigation";

export const metadata = {
    title: "Manage Departments | Admin Portal",
};

export type DepartmentRow = {
    id: string;
    name: string;
    team: string | null;
    team_id: string | null;
    description: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
    worker_count: number;
};

export default async function DepartmentsPage() {
    const scope = await requireAdminAuth();
    if (!scope.isSuperAdmin && !scope.isTeamAdmin) {
        redirect("/admin");
    }

    const supabase = await createClient();

    let departmentsQuery = supabase
        .from("departments")
        .select("id, name, team, team_id, description, is_active, created_at, updated_at")
        .order("name", { ascending: true });

    if (!scope.isSuperAdmin) {
        departmentsQuery = departmentsQuery.in("team_id", scope.managedTeamIds);
    }

    let profilesQuery = supabase
        .from("profiles")
        .select("department_id")
        .not("department_id", "is", null);

    if (!scope.isSuperAdmin) {
        profilesQuery = profilesQuery.in("department_id", scope.managedDepartmentIds);
    }

    // Parallelize queries to eliminate waterfalls and speed up tab navigation
    const [departmentsRes, profilesRes] = await Promise.all([
        departmentsQuery,
        profilesQuery,
    ]);

    if (departmentsRes.error) {
        console.error("Error fetching departments:", departmentsRes.error);
    }
    if (profilesRes.error) {
        console.error("Error fetching department usage:", profilesRes.error);
    }

    const departments = departmentsRes.data || [];
    const assignedProfiles = profilesRes.data || [];

    const workerCounts = new Map<string, number>();
    for (const profile of assignedProfiles || []) {
        if (!profile.department_id) continue;
        workerCounts.set(profile.department_id, (workerCounts.get(profile.department_id) || 0) + 1);
    }

    const formattedDepartments: DepartmentRow[] = (departments || []).map((department) => ({
        ...department,
        worker_count: workerCounts.get(department.id) || 0,
    }));

    return <DepartmentsClient initialDepartments={formattedDepartments} />;
}
