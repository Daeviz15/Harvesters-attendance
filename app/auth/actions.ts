'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { sendPasswordResetEmail } from '@/lib/auth-reset-email'
import { z } from 'zod'
import { generateTeamWorkerId } from '@/lib/workerId'
import { validateDateOfBirth } from '@/lib/date-of-birth'
import { getSafeAuthRedirectPath } from '@/lib/auth-redirect'

type ActionState = { error?: string; success?: string } | null

const inactiveAccountMessage = 'Your account has been deactivated. Please contact your department head, team lead, or an administrator for support.'

const forgotPasswordSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address.').max(254, 'Email address is too long.'),
})

const resetPasswordSchema = z.object({
  password: z.string()
    .min(8, 'Password must be at least 8 characters.')
    .max(128, 'Password cannot exceed 128 characters.'),
  confirmPassword: z.string(),
}).refine((value) => value.password === value.confirmPassword, {
  message: 'Passwords do not match.',
  path: ['confirmPassword'],
})

const onboardingSchema = z.object({
  workerId: z.string().trim().optional(),
  firstName: z.string().trim()
    .min(2, 'First name is required (at least 2 characters).')
    .max(50, 'First name cannot exceed 50 characters.')
    .regex(/^[a-zA-Z\s\-']+$/, 'First name contains invalid characters.'),
  lastName: z.string().trim().max(50, 'Last name cannot exceed 50 characters.').optional(),
  departmentId: z.string().uuid({ message: 'Please select a valid department.' }),
  phone: z.string().regex(/^\d{10}$/, 'Phone number must be exactly 10 digits (e.g., 8012345678).'),
  avatarUrl: z.string().trim().url('Profile image URL is invalid.').max(2048).optional().nullable(),
  dateOfBirth: z.string().trim(),
})

function isAllowedAvatarUrl(
  value: string,
  userId: string,
  userMetadata: Record<string, unknown>,
) {
  try {
    const avatarUrl = new URL(value)
    const supabaseUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '')
    const expectedStoragePrefix = `/storage/v1/object/public/avatars/${userId}/`
    const metadataAvatar = [userMetadata.avatar_url, userMetadata.picture]
      .find((candidate): candidate is string => typeof candidate === 'string')

    const isOwnedStorageAvatar = avatarUrl.origin === supabaseUrl.origin
      && avatarUrl.pathname.startsWith(expectedStoragePrefix)
    const isOriginalGoogleAvatar = avatarUrl.hostname === 'lh3.googleusercontent.com'
      && metadataAvatar === value

    return avatarUrl.protocol === 'https:'
      && !avatarUrl.username
      && !avatarUrl.password
      && (isOwnedStorageAvatar || isOriginalGoogleAvatar)
  } catch {
    return false
  }
}

function normalizeConfiguredOrigin(value: string | undefined) {
  if (!value) return null

  try {
    const parsed = new URL(value)
    if (!['http:', 'https:'].includes(parsed.protocol)) return null
    if (parsed.username || parsed.password) return null
    return parsed.origin
  } catch {
    return null
  }
}

async function getPasswordRecoveryOrigin() {
  if (process.env.NODE_ENV !== 'production') {
    const requestHeaders = await headers()
    const host = requestHeaders.get('x-forwarded-host') || requestHeaders.get('host') || 'localhost:3000'
    const protocol = requestHeaders.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https')

    return `${protocol}://${host}`
  }

  const configuredOrigin = normalizeConfiguredOrigin(
    process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL
  )

  if (configuredOrigin) {
    return configuredOrigin
  }

  return 'https://www.globeattendance.org'
}

export async function requestPasswordReset(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = forgotPasswordSchema.safeParse({
    email: formData.get('email'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Please enter a valid email address.' }
  }

  const email = parsed.data.email.trim().toLowerCase()
  const successResponse = {
    success: 'If an account exists for that email, a password reset link has been sent.',
  }

  try {
    const adminClient = createAdminClient()
    const appOrigin = await getPasswordRecoveryOrigin()
    const confirmUrl = `${appOrigin}/auth/confirm?next=${encodeURIComponent('/auth/reset-password')}`

    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: {
        redirectTo: confirmUrl,
      },
    })

    if (linkError) {
      const isUserNotFound =
        linkError.code === 'user_not_found' ||
        linkError.status === 404 ||
        linkError.message?.toLowerCase().includes('not found')

      if (isUserNotFound) {
        console.info('[AuthAction] Password reset requested for non-existent email:', email)
        return successResponse
      }

      console.error('[AuthAction] generateLink failed:', linkError)
      return { error: 'We could not process that reset request right now. Please try again shortly.' }
    }

    const tokenHash = linkData?.properties?.hashed_token
    if (!tokenHash) {
      console.error('[AuthAction] generateLink did not return a token hash.')
      return { error: 'We could not process that reset request right now. Please try again shortly.' }
    }

    const resetUrl = `${appOrigin}/auth/confirm?token_hash=${tokenHash}&type=recovery&next=${encodeURIComponent('/auth/reset-password')}`

    let userName: string | undefined = undefined
    if (linkData.user?.id) {
      const { data: profile } = await adminClient
        .from('profiles')
        .select('full_name')
        .eq('id', linkData.user.id)
        .maybeSingle()

      if (profile?.full_name) {
        userName = profile.full_name.trim().split(' ')[0]
      }
    }

    const sendResult = await sendPasswordResetEmail({
      toEmail: email,
      resetUrl,
      userName,
      appOrigin,
    })

    if (!sendResult.success) {
      console.error('[AuthAction] Resend email dispatch failed:', sendResult.error)
      return { error: 'We could not dispatch the reset email right now. Please try again shortly.' }
    }

    return successResponse
  } catch (error) {
    console.error('[AuthAction] Password reset request failed:', error)
    return { error: 'We could not process that reset request right now. Please try again shortly.' }
  }
}

export async function updateRecoveredPassword(_prevState: ActionState, formData: FormData) {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Please enter a valid password.' }
  }

  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (userError || !user) {
    return { error: 'This reset link is invalid or has expired. Please request a new password reset link.' }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('is_active')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    console.error('[AuthAction] Password reset profile lookup failed:', profileError)
    return { error: 'We could not verify your account status. Please try again shortly.' }
  }

  if (profile?.is_active === false) {
    await supabase.auth.signOut()
    return { error: inactiveAccountMessage }
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  })

  if (error) {
    console.error('[AuthAction] Password update failed:', error)
    return { error: 'We could not update your password. Please try again with a stronger password.' }
  }

  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/auth/login?reason=password_reset_success')
}

export async function login(_prevState: ActionState, formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const redirectTo = getSafeAuthRedirectPath(formData.get('redirectTo'))

  if (!email || !password) {
    return { error: 'Email and password are required' }
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    const message = error.message.toLowerCase()
    if (message.includes('ban') || message.includes('deactivated') || message.includes('inactive')) {
      return { error: inactiveAccountMessage }
    }

    return { error: error.message }
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_active')
      .eq('id', user.id)
      .maybeSingle()

    if (!profileError && profile?.is_active === false) {
      await supabase.auth.signOut()
      return { error: inactiveAccountMessage }
    }
  }

  revalidatePath('/', 'layout')
  redirect(redirectTo)
}

export async function signup(_prevState: ActionState, formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: 'Email and password are required' }
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.signUp({
    email,
    password,
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/', 'layout')
  redirect('/onboarding')
}

export async function completeOnboarding(_prevState: ActionState, formData: FormData) {
  const rawData = {
    workerId: formData.get('workerId'),
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName') || '',
    departmentId: formData.get('departmentId'),
    phone: ((formData.get('phone') as string | null) || '').replace(/\D/g, ''),
    avatarUrl: formData.get('avatarUrl') || null,
    dateOfBirth: formData.get('dateOfBirth') || '',
  }

  const validatedFields = onboardingSchema.safeParse(rawData)

  if (!validatedFields.success) {
    const firstError = validatedFields.error.issues[0]?.message || 'Please check your inputs and try again.'
    return { error: firstError }
  }

  const { workerId, firstName, lastName, departmentId, phone, avatarUrl, dateOfBirth } = validatedFields.data
  const birthDate = validateDateOfBirth(dateOfBirth)
  if (birthDate.error || !birthDate.dateOfBirth) {
    return { error: birthDate.error || 'Please enter a valid birthday.' }
  }

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized. Please log in again.' }
  }

  if (avatarUrl && !isAllowedAvatarUrl(avatarUrl, user.id, user.user_metadata)) {
    return { error: 'Please upload your profile picture through this form.' }
  }

  const { data: department, error: departmentError } = await supabase
    .from('departments')
    .select('id, name, team, team_id')
    .eq('id', departmentId)
    .eq('is_active', true)
    .single()

  if (departmentError || !department) {
    return { error: 'Please select an active department.' }
  }

  
  // Check if user already has a assigned worker_id
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('worker_id')
    .eq('id', user.id)
    .maybeSingle()

  const finalWorkerId = existingProfile?.worker_id || workerId || ''
  
  // If the user already has a valid ID, we just do a normal update
  if (finalWorkerId && !finalWorkerId.startsWith('HRV-')) {
    const { error: dbError } = await supabase
      .from('profiles')
      .update({
        first_name: firstName,
        last_name: lastName || '',
        department_id: department.id,
        department: department.name,
        team: department.team,
        team_id: department.team_id,
        phone: `+234${phone}`,
        avatar_url: avatarUrl || null,
        date_of_birth: birthDate.dateOfBirth,
        onboarding_complete: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id)

    if (dbError) {
      console.error("Profile update error:", dbError)
      if (dbError.code === "23505" && (dbError.message?.includes('profiles_first_name_lower_unique') || dbError.message?.includes('first_name'))) {
        return { error: 'This first name is already registered. Please include your last name or an initial.' }
      }
      return { error: 'Failed to save profile data.' }
    }
  } else {
    // We need to generate a new ID atomically
    const adminSupabase = createAdminClient()
    const { error: rpcError } = await adminSupabase.rpc('register_worker_atomic', {
      p_user_id: user.id,
      p_team: department.team,
      p_first_name: firstName,
      p_last_name: lastName || '',
      p_department_id: department.id,
      p_department_name: department.name,
      p_phone: phone,
      p_avatar_url: avatarUrl || ''
    })

    if (rpcError) {
      console.error("Atomic registration error:", rpcError)
      if (rpcError.code === "23505" && (rpcError.message?.includes('profiles_first_name_lower_unique') || rpcError.message?.includes('first_name'))) {
        return { error: 'This first name is already registered. Please include your last name or an initial.' }
      }
      return { error: rpcError.message || 'System is experiencing exceptionally high load. Please try submitting again.' }
    }

    const { error: birthDateUpdateError } = await adminSupabase
      .from('profiles')
      .update({
        date_of_birth: birthDate.dateOfBirth,
        team_id: department.team_id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (birthDateUpdateError) {
      console.error("Birthday update after atomic registration error:", birthDateUpdateError)
      return { error: 'Your profile was created, but birthday could not be saved. Please try again.' }
    }
  }

  // Persist the welcome message in the durable outbox before completing the auth
  // transition. A retry is safe because the database enforces one welcome job.
  const emailAdminSupabase = createAdminClient()
  const { error: welcomeQueueError } = await emailAdminSupabase.rpc('enqueue_welcome_email', {
    p_user_id: user.id,
  })

  if (welcomeQueueError) {
    console.error('[AuthAction] Unable to queue welcome email:', welcomeQueueError)
    return { error: 'Your profile was saved, but setup could not be finalized. Please try again.' }
  }

  // Update user_metadata ONLY with the onboarding flag for proxy checks
  const { error } = await supabase.auth.updateUser({
    data: {
      onboarding_complete: true,
    },
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  
  revalidatePath('/', 'layout')
  redirect('/auth/login')
}

export async function getUpcomingWorkerIdPreview(teamName: string) {
  if (!teamName) return null;
  const adminClient = createAdminClient();
  return await generateTeamWorkerId(adminClient, teamName);
}
