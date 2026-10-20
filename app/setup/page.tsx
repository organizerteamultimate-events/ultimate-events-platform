import type { Metadata } from 'next'
import { CircleDashed } from 'lucide-react'
import { PageHeader } from '@/components/site/blocks'
import { setupChecklist } from '@/lib/site'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { isTransactionalEmailConfigured } from '@/lib/email'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Platform Status', robots: { index: false } }

export default async function SetupPage() {
  const supabase = await createSupabaseServerClient()
  const { data: paymentSettings, error: paymentSettingsError } = supabase
    ? await supabase.from('platform_settings').select('upi_id').eq('id', true).maybeSingle()
    : { data: null, error: null }
  return (
    <>
      <PageHeader
        eyebrow="Platform Status"
        title="Configuration checklist"
        description="Supabase Auth and profile flows are implemented. Verify that the ordered migrations are applied, then configure the remaining services needed by your event workflows."
      />
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <ul className="flex flex-col gap-4">
          {setupChecklist.map((item) => {
            const status = item.name === 'Supabase project'
              ? isSupabaseConfigured() ? 'Credentials configured — verify database migrations' : 'Awaiting configuration'
              : item.name === 'Email provider'
                ? isTransactionalEmailConfigured() ? 'Server SMTP credentials configured' : 'SMTP credentials required'
                : item.name === 'Manual UPI payments'
                  ? paymentSettingsError ? 'Apply participant workflows migration' : paymentSettings?.upi_id ? 'Configured in Admin settings' : 'Set UPI details in Admin settings'
                  : 'Awaiting configuration'
            return (
              <li key={item.name} className="flex flex-col gap-3 rounded-2xl border bg-card p-6 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-bold">{item.name}</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.purpose}</p>
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
          See <span className="font-semibold">SUPABASE_SETUP.md</span> in the project for Auth redirect settings, database migration instructions, and secure first-admin setup. Never put a service-role key in browser environment variables.
        </p>
      </div>
    </>
  )
}
