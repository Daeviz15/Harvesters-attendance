import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isOnboardingComplete = user?.user_metadata?.onboarding_complete === true;
  const isAuthPage = request.nextUrl.pathname.startsWith('/auth/login') || request.nextUrl.pathname.startsWith('/auth/signup');
  const isDashboardPage = request.nextUrl.pathname.startsWith('/dashboard');
  const isOnboardingPage = request.nextUrl.pathname.startsWith('/onboarding');

  if (!user && (isDashboardPage || isOnboardingPage)) {
    // no user, redirect to login page
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    return NextResponse.redirect(url)
  }

  if (user) {
    if (!isOnboardingComplete && !isOnboardingPage && !isAuthPage) {
        // Enforce onboarding
        const url = request.nextUrl.clone()
        url.pathname = '/onboarding'
        return NextResponse.redirect(url)
    }

    if (isOnboardingComplete && (isAuthPage || isOnboardingPage)) {
        // Redirect authenticated users with complete onboarding away from auth and onboarding pages
        const url = request.nextUrl.clone()
        url.pathname = '/dashboard'
        return NextResponse.redirect(url)
    }

    if (!isOnboardingComplete && isAuthPage) {
        // Redirect to onboarding if not complete
        const url = request.nextUrl.clone()
        url.pathname = '/onboarding'
        return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}
