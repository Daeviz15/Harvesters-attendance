import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getSafeAuthRedirectPath } from '@/lib/auth-redirect'

import { type EmailOtpType } from '@supabase/supabase-js'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const tokenHash = requestUrl.searchParams.get('token_hash')
  const type = requestUrl.searchParams.get('type') as EmailOtpType | null
  const requestedNextPath = requestUrl.searchParams.get('next')
  const nextPath = requestedNextPath === '/auth/reset-password'
    ? '/auth/reset-password'
    : getSafeAuthRedirectPath(requestedNextPath)

  if (tokenHash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    })

    if (!error) {
      if (nextPath === '/auth/reset-password') {
        return NextResponse.redirect(new URL('/auth/reset-password', requestUrl.origin))
      }
      return NextResponse.redirect(new URL(nextPath, requestUrl.origin))
    }

    console.error('[AuthCallback] Token verification failed:', error)
    if (type === 'recovery') {
      return NextResponse.redirect(new URL('/auth/reset-password', requestUrl.origin))
    }
  }

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

        if (nextPath === '/auth/reset-password') {
          return NextResponse.redirect(new URL('/auth/reset-password', requestUrl.origin))
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
