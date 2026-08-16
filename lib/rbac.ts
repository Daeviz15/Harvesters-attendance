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
    is_active: boolean | null;
    department_id: string | null;
    department: string | null;
    team_id: string | null;
    team: string | null;
    date_of_birth: string | null;
  };
  isSuperAdmin: boolean;
  isTeamAdmin: boolean;
  isDeptHead: boolean;
  isReportsAdmin: boolean;
  isReportsOnlyAdmin: boolean;
  managedTeams: ManagedTeam[];
  managedTeamIds: string[];
  managedDepartments: ManagedDepartment[];
  managedDepartmentIds: string[];
  reportDepartmentIds: string[];
  hasGlobalReportAccess: boolean;
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
    redirect("/auth/login?reason=login_required&next=/admin");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, role, is_active, department_id, department, team_id, team, date_of_birth")
    .eq("id", user.id)
    .single();

  if (!profile || profile.is_active === false) {
    redirect("/auth/login?reason=login_required&next=/admin");
  }

  const isSuperAdmin = profile.role === "admin" || profile.role === "super_admin";
  const hasTeamAdminRole = profile.role === "team_admin";
  const hasReportsAdminRole = profile.role === "reports_admin";
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

  if (!hasReportsAdminRole) {
    const { data: headDepartments, error: headDepartmentsError } = await supabase
      .from("departments")
      .select("id, name, team_id")
      .eq("head_user_id", user.id)
      .eq("is_active", true);

    if (headDepartmentsError) {
      console.error("[RBAC] Failed to fetch department head scope:", headDepartmentsError);
    }

    managedDepartments.push(...((headDepartments || []) as ManagedDepartment[]));
  }

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
  const isDeptHead = !hasReportsAdminRole && dedupedManagedDepartments.length > 0;

  const reportDepartments: ManagedDepartment[] = hasReportsAdminRole && !isSuperAdmin ? [] : [...dedupedManagedDepartments];
  let reportsAdminTeamName: string | null = null;
  let reportsAdminDepartmentName: string | null = null;

  if (hasReportsAdminRole && !isSuperAdmin) {
    if (profile.team_id) {
      const { data: reportsTeam, error: reportsTeamError } = await supabase
        .from("teams")
        .select("id, name")
        .eq("id", profile.team_id)
        .eq("is_active", true)
        .maybeSingle();

      if (reportsTeamError) {
        console.error("[RBAC] Failed to fetch reports admin team scope:", reportsTeamError);
      }

      if (reportsTeam) {
        reportsAdminTeamName = reportsTeam.name;

        const { data: scopedDepartments, error: scopedDepartmentsError } = await supabase
          .from("departments")
          .select("id, name, team_id")
          .eq("is_active", true)
          .eq("team_id", reportsTeam.id);

        if (scopedDepartmentsError) {
          console.error("[RBAC] Failed to fetch reports admin team departments:", scopedDepartmentsError);
        }

        reportDepartments.push(...((scopedDepartments || []) as ManagedDepartment[]));
      }
    } else if (profile.department_id) {
      const { data: reportsDepartment, error: reportsDepartmentError } = await supabase
        .from("departments")
        .select("id, name, team_id")
        .eq("id", profile.department_id)
        .eq("is_active", true)
        .maybeSingle();

      if (reportsDepartmentError) {
        console.error("[RBAC] Failed to fetch reports admin department scope:", reportsDepartmentError);
      }

      if (reportsDepartment) {
        reportsAdminDepartmentName = reportsDepartment.name;
        reportDepartments.push(reportsDepartment as ManagedDepartment);
      }
    }
  }

  const dedupedReportDepartments = uniqueById(reportDepartments);
  const reportDepartmentIds = dedupedReportDepartments.map((department) => department.id);
  const hasGlobalReportAccess = isSuperAdmin || (hasReportsAdminRole && !profile.team_id && !profile.department_id);
  const isReportsAdmin = hasReportsAdminRole;
  const isReportsOnlyAdmin = isReportsAdmin && !isSuperAdmin;

  if (!isSuperAdmin && !isTeamAdmin && !isDeptHead && !isReportsAdmin) {
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
  } else if (isReportsAdmin) {
    if (hasGlobalReportAccess) {
      scopeSummary = "Reports Admin (Global)";
    } else if (reportsAdminTeamName) {
      scopeSummary = `Reports Admin — ${reportsAdminTeamName}`;
    } else if (reportsAdminDepartmentName) {
      scopeSummary = `Reports Admin — ${reportsAdminDepartmentName}`;
    } else {
      scopeSummary = "Reports Admin";
    }
  }

  return {
    user,
    profile,
    isSuperAdmin,
    isTeamAdmin,
    isDeptHead,
    isReportsAdmin,
    isReportsOnlyAdmin,
    managedTeams,
    managedTeamIds,
    managedDepartments: dedupedManagedDepartments,
    managedDepartmentIds,
    reportDepartmentIds,
    hasGlobalReportAccess,
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
    redirect(scope.isReportsOnlyAdmin ? "/admin/reports" : "/admin");
  }
  return scope;
}

/**
 * Strict gatekeeper for admin-management surfaces.
 *
 * Reports-only admins may enter the admin shell, but they must not be able to
 * call mutation/read actions for workers, events, departments, sessions,
 * locations, email tests, or leave review workflows.
 */
export async function requireAdminManagementAuth(): Promise<AdminAuthScope> {
  const scope = await requireAdminAuth();
  if (scope.isReportsOnlyAdmin) {
    redirect("/admin/reports");
  }
  return scope;
}

/**
 * Gatekeeper for reports surfaces and report exports.
 */
export async function requireReportsAuth(): Promise<AdminAuthScope> {
  const scope = await requireAdminAuth();
  if (!scope.isSuperAdmin && !scope.isTeamAdmin && !scope.isDeptHead && !scope.isReportsAdmin) {
    redirect("/dashboard");
  }
  return scope;
}
