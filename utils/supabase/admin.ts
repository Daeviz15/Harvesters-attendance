import { createClient } from '@supabase/supabase-js';

/**
 * Creates a Supabase client with elevated administrative privileges using the Service Role Key.
 * MUST only be invoked from secure server-side environments (Server Actions / API Routes)
 * after verifying that the requesting user has an Admin role.
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase admin environment variables.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
