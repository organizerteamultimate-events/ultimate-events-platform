
import type { Metadata } from 'next'
import { CircleDashed } from 'lucide-react'
import { PageHeader } from '@/components/site/blocks'
import { setupChecklist } from '@/lib/site'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { isTransactionalEmailConfigured } from '@/lib/email'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: 'Platform Status',
  robots: { index: false },
}

export default async function SetupPage() {
  const supabase = await createSupabaseServerClient()

  let isAdmin = false
  let adminCheckFailed = false
  let paymentSettings: { upi_id: string | null } | null = null
  let paymentSettingsError = false

  if (supabase) {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError) {
      adminCheckFailed = true
    } else if (user) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role, account_status')
        .eq('id', user.id)
        .maybeSingle()

      if (profileError) {
        adminCheckFailed = true
      } else {
        isAdmin =
          profile?.role === 'admin' &&
          profile?.account_status === 'active'
      }
    }

    // UPI settings are checked only for an authenticated active admin.
    if (isAdmin) {
      const { data, error } = await supabase
        .from('platform_settings')
        .select('upi_id')
        .eq('id', true)
        .maybeSingle()

      paymentSettings = data
      paymentSettingsError = Boolean(error)
    }
  }

  const supabaseConfigured = isSupabaseConfigured()
  const emailConfigured = isTransactionalEmailConfigured()

  return (
    <>
      <PageHeader
        eyebrow="Platform Status"
        title="Configuration checklist"
        description="Review platform configuration. These checks do not automatically verify database migrations or successful email delivery."
      />

      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <ul className="flex flex-col gap-4">
          {setupChecklist.map((item) => {
            let status = 'Optional integration — not configured'

            if (item.name === 'Supabase project') {
              status = supabaseConfigured
                ? 'Credentials configured — schema not verified'
                : 'Supabase credentials required'
            } else if (item.name === 'Email provider') {
              status = emailConfigured
                ? 'SMTP credentials configured — delivery not verified'
                : 'Server SMTP credentials required'
            } else if (item.name === 'Manual UPI payments') {
              if (!supabase) {
                status = 'Database connection unavailable'
              } else if (adminCheckFailed) {
                status = 'Could not verify administrator access'
              } else if (!isAdmin) {
                status = 'Sign in with an administrator account to verify'
              } else if (paymentSettingsError) {
                status = 'Could not read UPI settings — check admin database access'
              } else if (paymentSettings?.upi_id?.trim()) {
                status = 'UPI ID configured in Admin settings'
              } else {
                status = 'UPI ID not configured in Admin settings'
              }
            } else if (item.name === 'Admin access') {
              if (!supabase) {
                status = 'Supabase connection unavailable'
              } else if (adminCheckFailed) {
                status = 'Could not verify admin profile'
              } else if (isAdmin) {
                status = 'Active administrator verified'
              } else {
                status = 'Administrator sign-in required'
              }
            }

            return (
              <li
                key={item.name}
                className="flex flex-col gap-3 rounded-2xl border bg-card p-6 sm:flex-row sm:items-start sm:justify-between"
              >
                <div>
                  <h2 className="text-lg font-bold">{item.name}</h2>

                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {item.purpose}
                  </p>

                  <p className="mt-3 text-sm">
                    <span className="font-semibold">Requires: </span>
                    {item.requires}
                  </p>
                </div>

                <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border border-gold/50 bg-accent px-3 py-1 text-xs font-semibold">
                  <CircleDashed className="size-3.5" aria-hidden="true" />
                  {status}
                </span>
              </li>
            )
          })}
        </ul>

        <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
          Database migrations are not applied automatically by this page.
          Never put a Supabase service-role key in browser environment variables.
        </p>
      </div>
    </>
  )
}
