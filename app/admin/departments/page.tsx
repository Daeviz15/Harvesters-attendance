import { createClient } from "@/utils/supabase/server";
import DepartmentsClient from "./DepartmentsClient";

export const metadata = {
    title: "Manage Departments | Admin Portal",
};

export type DepartmentRow = {
    id: string;
    name: string;
    description: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
    worker_count: number;
};

export default async function DepartmentsPage() {
    const supabase = await createClient();

    const { data: departments, error: departmentsError } = await supabase
        .from("departments")
        .select("id, name, description, is_active, created_at, updated_at")
        .order("name", { ascending: true });

    if (departmentsError) {
        console.error("Error fetching departments:", departmentsError);
    }

    const { data: assignedProfiles, error: profilesError } = await supabase
        .from("profiles")
        .select("department_id")
        .not("department_id", "is", null);

    if (profilesError) {
        console.error("Error fetching department usage:", profilesError);
    }

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
