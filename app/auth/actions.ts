'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { z } from 'zod'
import { generateTeamWorkerId } from '@/lib/workerId'
import { sendWelcomeEmail } from '@/lib/email'

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
  avatarUrl: z.string().optional().nullable(),
})

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
    avatarUrl: formData.get('avatarUrl'),
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

  let finalWorkerId = existingProfile?.worker_id || workerId || ''
  
  if (!finalWorkerId || finalWorkerId.startsWith('HRV-')) {
    const adminSupabase = createAdminClient()
    finalWorkerId = await generateTeamWorkerId(adminSupabase, department.team)
  }

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
      worker_id: finalWorkerId,
      onboarding_complete: true,
      updated_at: new Date().toISOString()
    })
    .eq('id', user.id)

  if (dbError) {
    console.error("Profile update error:", dbError)
    // 23505 = Unique constraint violation
    if (dbError.code === "23505") {
      // Tell the user if they hit the old first_name constraint (before running the hotfix SQL)
      if (dbError.message?.includes('profiles_first_name_lower_unique') || dbError.message?.includes('first_name')) {
        return { error: 'This first name is already registered. Please include your last name or an initial.' }
      }
      return { error: 'A user with these details already exists. Please check your inputs.' }
    }
    return { error: 'Failed to save profile data.' }
  }

  // Update user_metadata ONLY with the onboarding flag for Edge Middleware checks
  const { error } = await supabase.auth.updateUser({
    data: {
      onboarding_complete: true,
    },
  })

  if (error) {
    return { error: error.message }
  }

  // Send personalized welcome email asynchronously (non-blocking)
  if (user.email) {
    sendWelcomeEmail({
      toEmail: user.email,
      firstName,
      lastName: lastName || '',
      workerId: finalWorkerId,
      department: department.name,
      team: department.team,
    }).catch(err => console.error('[AuthAction] Welcome email error:', err));
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
