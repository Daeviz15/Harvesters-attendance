import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    
    // Securely exchange the OAuth code for an HTTP-only cookie session
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error) {
      // Fetch the user to determine routing logic
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        // Double-check the profiles table for robust verification
        // (Just in case the metadata is out of sync)
        const { data: profile } = await supabase
          .from('profiles')
          .select('onboarding_complete')
          .eq('id', user.id)
          .single()

        // If onboarding is complete (either in profile DB or fast metadata), go straight to dashboard
        if (profile?.onboarding_complete || user.user_metadata?.onboarding_complete) {
          return NextResponse.redirect(new URL('/dashboard', requestUrl.origin))
        } else {
          // New user (or incomplete user): MUST complete onboarding
          return NextResponse.redirect(new URL('/onboarding', requestUrl.origin))
        }
      }
    } else {
      console.error("OAuth Code Exchange Error:", error)
    }
  }

  // Fallback to login if something fails or no code is present
  return NextResponse.redirect(new URL('/auth/login?error=auth-failed', requestUrl.origin))
}
