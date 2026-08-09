import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getSafeAuthRedirectPath } from '@/lib/auth-redirect'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const nextPath = getSafeAuthRedirectPath(requestUrl.searchParams.get('next'))

  if (code) {
    const supabase = await createClient()
    
    
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error) {
      
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        
        
        const { data: profile } = await supabase
          .from('profiles')
          .select('onboarding_complete, is_active')
          .eq('id', user.id)
          .single()

        if (profile?.is_active === false) {
          await supabase.auth.signOut()
          return NextResponse.redirect(new URL('/auth/login?reason=account_inactive', requestUrl.origin))
        }

        
        if (profile?.onboarding_complete || user.user_metadata?.onboarding_complete) {
          return NextResponse.redirect(new URL(nextPath, requestUrl.origin))
        } else {
          
          return NextResponse.redirect(new URL('/onboarding', requestUrl.origin))
        }
      }
    } else {
      console.error("OAuth Code Exchange Error:", error)
    }
  }

  
  return NextResponse.redirect(new URL('/auth/login?error=auth-failed', requestUrl.origin))
}
