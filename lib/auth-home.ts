import type { User } from "@supabase/supabase-js";
import type { createClient } from "@/utils/supabase/server";

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

export async function getAuthenticatedHomePath(
  supabase: ServerSupabaseClient,
  user: User
) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, is_active, onboarding_complete")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.is_active === false) {
    return "/auth/login?reason=account_inactive";
  }

  const hasCompletedOnboarding =
    profile?.onboarding_complete === true || user.user_metadata?.onboarding_complete === true;

  if (!profile || !hasCompletedOnboarding) {
    return "/onboarding";
  }

  const role = profile.role;
  if (role === "reports_admin") {
    return "/admin/reports";
  }

  if (role === "admin" || role === "super_admin" || role === "team_admin") {
    return "/admin";
  }

  const { data: headedDepartment } = await supabase
    .from("departments")
    .select("id")
    .eq("head_user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (headedDepartment) {
    return "/admin";
  }

  return "/dashboard";
}
