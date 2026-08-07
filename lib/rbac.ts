import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { User } from "@supabase/supabase-js";

export interface ManagedDepartment {
  id: string;
  name: string;
  team_id: string | null;
}

export interface ManagedTeam {
  id: string;
  name: string;
  code: string;
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
    team_id: string | null;
    team: string | null;
  };
  isSuperAdmin: boolean;
  isTeamAdmin: boolean;
  isDeptHead: boolean;
  managedTeams: ManagedTeam[];
  managedTeamIds: string[];
  managedDepartments: ManagedDepartment[];
  managedDepartmentIds: string[];
  scopeSummary: string;
  initials: string;
}

function uniqueById<T extends { id: string }>(rows: T[]) {
  return Array.from(new Map(rows.map((row) => [row.id, row])).values());
}

/**
 * Production-grade zero-trust authorization utility.
 *
 * Every admin page/action must call this and then enforce the returned scope.
 * Rendering an admin UI is not a security boundary; Server Actions are public
 * POST entry points and must re-check authorization server-side.
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, role, department_id, department, team_id, team")
    .eq("id", user.id)
    .single();

  if (!profile) {
    redirect("/auth/login");
  }

  const isSuperAdmin = profile.role === "admin" || profile.role === "super_admin";
  const hasTeamAdminRole = profile.role === "team_admin";
  const teamIds = new Set<string>();

  if (hasTeamAdminRole && profile.team_id) {
    teamIds.add(profile.team_id);
  }

  if (hasTeamAdminRole) {
    const { data: assignments, error: assignmentsError } = await supabase
      .from("team_admin_assignments")
      .select("team_id")
      .eq("user_id", user.id);

    if (assignmentsError) {
      console.error("[RBAC] Failed to fetch team admin assignments:", assignmentsError);
    }

    for (const assignment of assignments || []) {
      if (assignment.team_id) teamIds.add(assignment.team_id);
    }
  }

  let managedTeams: ManagedTeam[] = [];
  if (teamIds.size > 0) {
    const { data: teams, error: teamsError } = await supabase
      .from("teams")
      .select("id, name, code")
      .eq("is_active", true)
      .in("id", Array.from(teamIds));

    if (teamsError) {
      console.error("[RBAC] Failed to fetch managed teams:", teamsError);
    }

    managedTeams = (teams || []) as ManagedTeam[];
  }

  const managedTeamIds = managedTeams.map((team) => team.id);
  const managedDepartments: ManagedDepartment[] = [];

  const { data: headDepartments, error: headDepartmentsError } = await supabase
    .from("departments")
    .select("id, name, team_id")
    .eq("head_user_id", user.id)
    .eq("is_active", true);

  if (headDepartmentsError) {
    console.error("[RBAC] Failed to fetch department head scope:", headDepartmentsError);
  }

  managedDepartments.push(...((headDepartments || []) as ManagedDepartment[]));

  if (managedTeamIds.length > 0) {
    const { data: teamDepartments, error: teamDepartmentsError } = await supabase
      .from("departments")
      .select("id, name, team_id")
      .eq("is_active", true)
      .in("team_id", managedTeamIds);

    if (teamDepartmentsError) {
      console.error("[RBAC] Failed to fetch team department scope:", teamDepartmentsError);
    }

    managedDepartments.push(...((teamDepartments || []) as ManagedDepartment[]));
  }

  const dedupedManagedDepartments = uniqueById(managedDepartments);
  const isTeamAdmin = hasTeamAdminRole && managedTeams.length > 0;
  const isDeptHead = dedupedManagedDepartments.length > 0;

  if (!isSuperAdmin && !isTeamAdmin && !isDeptHead) {
    redirect("/dashboard");
  }

  const managedDepartmentIds = dedupedManagedDepartments.map((department) => department.id);
  const initials = `${profile.first_name?.[0] || ""}${profile.last_name?.[0] || ""}`.toUpperCase() || "AD";

  let scopeSummary = "Worker Access";
  if (isSuperAdmin) {
    scopeSummary = "Super Admin (Global)";
  } else if (isTeamAdmin) {
    scopeSummary = `Team Admin — ${managedTeams.map((team) => team.name).join(", ")}`;
  } else if (isDeptHead) {
    scopeSummary = `Dept Head — ${dedupedManagedDepartments.map((department) => department.name).join(", ")}`;
  }

  return {
    user,
    profile,
    isSuperAdmin,
    isTeamAdmin,
    isDeptHead,
    managedTeams,
    managedTeamIds,
    managedDepartments: dedupedManagedDepartments,
    managedDepartmentIds,
    scopeSummary,
    initials,
  };
}

/**
 * Strict gatekeeper for global-only administration.
 */
export async function requireSuperAdminAuth(): Promise<AdminAuthScope> {
  const scope = await requireAdminAuth();
  if (!scope.isSuperAdmin) {
    redirect("/admin");
  }
  return scope;
}
