'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { z } from 'zod'
import { generateTeamWorkerId } from '@/lib/workerId'

type ActionState = { error?: string } | null

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

export async function login(_prevState: ActionState, formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: 'Email and password are required' }
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
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
  }

  const validatedFields = onboardingSchema.safeParse(rawData)

  if (!validatedFields.success) {
    const firstError = validatedFields.error.issues[0]?.message || 'Please check your inputs and try again.'
    return { error: firstError }
  }

  const { workerId, firstName, lastName, departmentId, phone, avatarUrl } = validatedFields.data

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
    .select('id, name, team')
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
        phone: `+234${phone}`,
        avatar_url: avatarUrl || null,
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
