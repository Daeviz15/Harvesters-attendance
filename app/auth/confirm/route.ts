import { type EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'
import { getSafeAuthRedirectPath } from '@/lib/auth-redirect'
import { createClient } from '@/utils/supabase/server'

const PASSWORD_RESET_PATH = '/auth/reset-password'

function getSafeConfirmRedirectPath(type: EmailOtpType | null, value: string | null) {
  if (type === 'recovery' && value === PASSWORD_RESET_PATH) {
    return PASSWORD_RESET_PATH
  }

  return getSafeAuthRedirectPath(value)
}

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get('token_hash')
  const type = request.nextUrl.searchParams.get('type') as EmailOtpType | null
  const nextPath = getSafeConfirmRedirectPath(
    type,
    request.nextUrl.searchParams.get('next')
  )

  const redirectTo = request.nextUrl.clone()
  redirectTo.pathname = nextPath
  redirectTo.search = ''
  redirectTo.hash = ''

  if (tokenHash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    })

    if (!error) {
      return NextResponse.redirect(redirectTo)
    }

    console.error('[AuthConfirm] Token verification failed:', error)

    if (type === 'recovery') {
      const resetExpiredRedirect = request.nextUrl.clone()
      resetExpiredRedirect.pathname = PASSWORD_RESET_PATH
      resetExpiredRedirect.search = ''
      resetExpiredRedirect.hash = ''
      return NextResponse.redirect(resetExpiredRedirect)
    }
  }

  const errorRedirect = request.nextUrl.clone()
  errorRedirect.pathname = '/auth/login'
  errorRedirect.search = '?error=auth-failed'
  errorRedirect.hash = ''

  return NextResponse.redirect(errorRedirect)
}
