'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { z } from 'zod'

type ActionState = { error?: string } | null

const onboardingSchema = z.object({
  departmentId: z.string().uuid({ message: 'Please select a department.' }),
  phone: z.string().regex(/^\d{10}$/, 'Phone number must be exactly 10 digits (e.g., 8012345678).'),
  avatarUrl: z.string().url({ message: 'Please upload a profile picture.' }),
  username: z.string().trim()
    .min(2, 'Username must be at least 2 characters.')
    .max(32, 'Username cannot exceed 32 characters.')
    .regex(/^[a-zA-Z0-9_ ]+$/, 'Username can only contain letters, numbers, underscores, and spaces.'),
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
  const username = formData.get('username') as string

  if (!email || !password || !username) {
    return { error: 'Email, password, and username are required' }
  }

  const supabase = await createClient()

  // Pre-validate username uniqueness before creating the auth account
  const { data: existingUser } = await supabase
    .from('profiles')
    .select('id')
    .ilike('first_name', username)
    .eq('onboarding_complete', true)
    .maybeSingle()

  if (existingUser) {
    return { error: 'This username is already taken. Please choose another one.' }
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name: username || '',
      },
    },
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/', 'layout')
  redirect('/onboarding')
}

export async function completeOnboarding(_prevState: ActionState, formData: FormData) {
  const rawData = {
    departmentId: formData.get('departmentId'),
    phone: ((formData.get('phone') as string | null) || '').replace(/\D/g, ''),
    avatarUrl: formData.get('avatarUrl'),
    username: formData.get('username'),
  }

  const validatedFields = onboardingSchema.safeParse(rawData)

  if (!validatedFields.success) {
    const firstError = validatedFields.error.issues[0]?.message || 'Please check your inputs and try again.'
    return { error: firstError }
  }

  const { departmentId, phone, avatarUrl, username } = validatedFields.data

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

  // 1. Update the profiles table (Production Database)
  const { error: dbError } = await supabase
    .from('profiles')
    .update({
      first_name: username,
      last_name: "", // Clear out any real last name captured by Google
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
    if (dbError.code === "23505") {
        return { error: 'This username is already taken. Please choose another one.' }
    }
    return { error: 'Failed to save profile data.' }
  }

  // 2. Update user_metadata ONLY with the onboarding flag for blazing fast Edge Middleware checks
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
