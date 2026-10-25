import 'server-only'

import { cache } from 'react'
import { redirect } from 'next/navigation'
import { isActiveAccountStatus } from '@/lib/auth'
import { getSupabaseConfig } from './config'
import { createSupabaseServerClient } from './server'

export const requireParticipantAccess = cache(async () => {
  if (!getSupabaseConfig()) redirect('/setup?error=supabase-not-configured')

  const supabase = await createSupabaseServerClient()
  if (!supabase) redirect('/setup?error=supabase-not-configured')

  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) {
    redirect('/login?next=%2Fdashboard')
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('account_status')
    .eq('id', authData.user.id)
    .maybeSingle()

  if (profileError || !isActiveAccountStatus(profile?.account_status)) {
    redirect('/login?error=account-unavailable')
  }
})

export const requireAdminAccess = cache(async () => {
  if (!getSupabaseConfig()) redirect('/setup?error=supabase-not-configured')

  const supabase = await createSupabaseServerClient()
  if (!supabase) redirect('/setup?error=supabase-not-configured')

  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) redirect('/admin/login')

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, account_status')
    .eq('id', authData.user.id)
    .maybeSingle()

  if (profileError || !isActiveAccountStatus(profile?.account_status)) {
    redirect('/admin/login?error=account-unavailable')
  }
  if (profile.role !== 'admin') redirect('/admin/login?error=unauthorized')
})
