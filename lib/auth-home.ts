import type { User } from "@supabase/supabase-js";
import type { createClient } from "@/utils/supabase/server";

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

export async function getAuthenticatedHomePath(
  supabase: ServerSupabaseClient,
  user: User
) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, is_active, onboarding_complete")
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

  return "/dashboard";
}
