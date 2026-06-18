'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

export async function login(prevState: any, formData: FormData) {
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

export async function signup(prevState: any, formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const name = formData.get('name') as string

  if (!email || !password) {
    return { error: 'Email and password are required' }
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name: name || '',
      },
    },
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/', 'layout')
  redirect('/onboarding')
}

export async function completeOnboarding(prevState: any, formData: FormData) {
  const department = formData.get('department') as string
  const phone = formData.get('phone') as string

  if (!department || !phone) {
    return { error: 'Department and phone number are required' }
  }

  // Validate that phone contains exactly 10 digits
  const phoneDigitsOnly = phone.replace(/\D/g, '')
  if (phoneDigitsOnly.length !== 10) {
    return { error: 'Phone number must be exactly 10 digits.' }
  }

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized. Please log in again.' }
  }

  // 1. Update the profiles table (Production Database)
  const { error: dbError } = await supabase
    .from('profiles')
    .update({
      department,
      phone: `+234${phoneDigitsOnly}`,
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
