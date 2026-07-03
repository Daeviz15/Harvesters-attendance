'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { z } from 'zod'

type ActionState = { error?: string } | null

const onboardingSchema = z.object({
  departmentId: z.uuid(),
  phone: z.string().regex(/^\d{10}$/, 'Phone number must be exactly 10 digits.'),
  avatarUrl: z.url(),
  username: z.string().trim().min(2).max(32).regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores.'),
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

  if (!email || !password) {
    return { error: 'Email and password are required' }
  }

  const supabase = await createClient()

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
    return { error: 'Username, department, phone number, and profile picture are required.' }
  }

  const { departmentId, phone, avatarUrl, username } = validatedFields.data

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized. Please log in again.' }
  }

  const { data: department, error: departmentError } = await supabase
    .from('departments')
    .select('id, name')
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
      phone: `+234${phone}`,
      avatar_url: avatarUrl || null,
      onboarding_complete: true,
      updated_at: new Date().toISOString()
    })
    .eq('id', user.id)

  if (dbError) {
    console.error("Profile update error:", dbError)
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
