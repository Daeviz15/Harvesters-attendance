import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { User } from "@supabase/supabase-js";

export interface ManagedDepartment {
  id: string;
  name: string;
}

export interface AdminAuthScope {
  user: User;
  profile: {
    id: string;
    first_name: string;
    last_name: string;
    role: string;
    department_id: string | null;
    department: string | null;
  };
  isSuperAdmin: boolean;
  isDeptHead: boolean;
  managedDepartments: ManagedDepartment[];
  managedDepartmentIds: string[];
  scopeSummary: string;
  initials: string;
}

/**
 * Production-Grade Zero-Trust Authorization Utility
 * Checks authentication & retrieves exact RBAC scope (Super Admin vs Department Head).
 */
export async function requireAdminAuth(): Promise<AdminAuthScope> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error) {
    throw new Error(`Authentication check failed: ${error.message}`);
  }

  if (!user) {
    redirect("/auth/login");
  }

  // Fetch Profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, role, department_id, department")
    .eq("id", user.id)
    .single();

  if (!profile) {
    redirect("/auth/login");
  }

  const isSuperAdmin = profile.role === "admin" || profile.role === "super_admin";

  // Fetch all departments where this user is assigned as Head
  const { data: headDepts } = await supabase
    .from("departments")
    .select("id, name")
    .eq("head_user_id", user.id)
    .eq("is_active", true);

  const managedDepartments: ManagedDepartment[] = headDepts || [];
  const isDeptHead = managedDepartments.length > 0;

  // Access Denied: User is neither a Super Admin nor a Department Head
  if (!isSuperAdmin && !isDeptHead) {
    redirect("/dashboard");
  }

  const managedDepartmentIds = managedDepartments.map((d) => d.id);
  const initials = `${profile.first_name?.[0] || ""}${profile.last_name?.[0] || ""}`.toUpperCase() || "AD";

  let scopeSummary = "Worker Access";
  if (isSuperAdmin) {
    scopeSummary = "Super Admin (Global)";
  } else if (isDeptHead) {
    scopeSummary = `Dept Head — ${managedDepartments.map((d) => d.name).join(", ")}`;
  }

  return {
    user,
    profile,
    isSuperAdmin,
    isDeptHead,
    managedDepartments,
    managedDepartmentIds,
    scopeSummary,
    initials,
  };
}

/**
 * Strict Gatekeeper: Requires Super Admin rights (for location, global department, and role management)
 */
export async function requireSuperAdminAuth(): Promise<AdminAuthScope> {
  const scope = await requireAdminAuth();
  if (!scope.isSuperAdmin) {
    redirect("/admin");
  }
  return scope;
}
