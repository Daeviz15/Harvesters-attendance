import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    
    
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error) {
      
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        
        
        const { data: profile } = await supabase
          .from('profiles')
          .select('onboarding_complete')
          .eq('id', user.id)
          .single()

        
        if (profile?.onboarding_complete || user.user_metadata?.onboarding_complete) {
          return NextResponse.redirect(new URL('/dashboard', requestUrl.origin))
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
