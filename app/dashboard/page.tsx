import Link from 'next/link'
import {
  ArrowRight,
  Award,
  BookOpen,
  CalendarDays,
  ClipboardList,
  CreditCard,
  Trophy,
  UserRound,
} from 'lucide-react'
import { PanelAccessNotice, PanelPageHeading, PanelStat } from '@/components/dashboard/panel-shell'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/supabase/config'

const shortcuts = [
  { label: 'Explore events', href: '/events', detail: 'Find upcoming programs and competitions', icon: CalendarDays },
  { label: 'Browse workshops', href: '/workshops', detail: 'Build skills with guided sessions', icon: BookOpen },
  { label: 'Complete your profile', href: '/dashboard/profile', detail: 'Review your participant information', icon: UserRound },
  { label: 'View certificates', href: '/dashboard/certificates', detail: 'Your eligible certificates will appear here', icon: Award },
]

const activity = [
  { label: 'Registrations', href: '/dashboard/registrations', icon: ClipboardList },
  { label: 'Payments', href: '/dashboard/payments', icon: CreditCard },
  { label: 'Competitions & results', href: '/dashboard/results', icon: Trophy },
]

export default async function DashboardPage() {
  let profile: { full_name: string; participant_id: string } | null = null
  let profileError: string | null = null
  let metrics = {
    registrations: null as number | null,
    upcoming: null as number | null,
    payments: null as number | null,
    certificates: null as number | null,
  }
  let metricsError: string | null = null

  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient()
    if (supabase) {
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError) {
        profileError = `Could not load your account: ${authError.message}`
      } else if (authData.user) {
        const { data, error } = await supabase
          .from('profiles')
          .select('full_name, participant_id')
          .eq('id', authData.user.id)
          .maybeSingle()
        if (error) profileError = `Could not load your participant profile: ${error.message}`
        else profile = data

        const [registrations, upcoming, payments, certificates] = await Promise.all([
          supabase.from('registrations').select('id', { count: 'exact', head: true }).eq('user_id', authData.user.id),
          supabase.from('events').select('id', { count: 'exact', head: true }).eq('status', 'published').gte('event_date', new Date().toISOString()),
          supabase.from('payments').select('id', { count: 'exact', head: true }).eq('user_id', authData.user.id).eq('status', 'pending'),
          supabase.from('certificates').select('id', { count: 'exact', head: true }).eq('user_id', authData.user.id).is('revoked_at', null),
        ])
        if (registrations.error || upcoming.error || payments.error || certificates.error) {
          metricsError = 'Account activity is unavailable. Apply the participant workflows migration and check its RLS policies.'
        } else {
          metrics = {
            registrations: registrations.count ?? 0,
            upcoming: upcoming.count ?? 0,
            payments: payments.count ?? 0,
            certificates: certificates.count ?? 0,
          }
        }
      }
    }
  }

  return (
    <>
      <PanelPageHeading
        eyebrow="Participant dashboard"
        title={profile ? `Welcome, ${profile.full_name}` : 'Your learning journey'}
        description="Keep track of your profile, events, workshops, competition activity, and certificates."
        action={{ href: '/events', label: 'Explore events' }}
      />
      <PanelAccessNotice />
      {profileError && (
        <p role="alert" className="mb-7 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {profileError}
        </p>
      )}
      {metricsError && (
        <p role="alert" className="mb-7 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {metricsError}
        </p>
      )}

      <section aria-labelledby="participant-id-heading" className="mb-7 rounded-2xl bg-ink p-6 text-ink-foreground sm:flex sm:items-center sm:justify-between sm:gap-8 sm:p-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-gold">Permanent participant ID</p>
          <h2 id="participant-id-heading" className="mt-2 font-mono text-2xl font-extrabold">{profile?.participant_id ?? 'Assigned after account setup'}</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-foreground/65">
            {profile
              ? 'This permanent ID is linked to your account and used for event registrations and certificates.'
              : 'A unique ID will be created and saved to your account after database and authentication services are configured.'}
          </p>
        </div>
        {!profile && (
          <Link href="/sign-up" className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-gold px-4 text-sm font-semibold text-gold-foreground hover:bg-gold/90 sm:mt-0">
            Create an account <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        )}
      </section>

      <section aria-label="Account activity" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <PanelStat label="My registrations" icon="clipboard" value={metrics.registrations?.toLocaleString() ?? '—'} detail="Stored event registrations" />
        <PanelStat label="Upcoming events" icon="calendar" value={metrics.upcoming?.toLocaleString() ?? '—'} detail="Published and scheduled" />
        <PanelStat label="Payments under review" icon="credit" value={metrics.payments?.toLocaleString() ?? '—'} detail="Manual UPI submissions awaiting review" />
        <PanelStat label="Certificates" icon="award" value={metrics.certificates?.toLocaleString() ?? '—'} detail="Issued, active certificates" />
      </section>

      <div className="mt-9 grid gap-8 xl:grid-cols-[1.35fr_0.85fr]">
        <section aria-labelledby="quick-actions-heading">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Get started</p>
              <h2 id="quick-actions-heading" className="mt-1 text-xl font-bold">Quick actions</h2>
            </div>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {shortcuts.map(({ label, href, detail, icon: Icon }) => (
              <li key={href}>
                <Link href={href} className="group flex h-full items-start gap-4 rounded-2xl border bg-card p-5 shadow-sm transition-colors hover:border-gold">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block font-semibold group-hover:text-foreground">{label}</span>
                    <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">{detail}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="activity-heading" className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Your account</p>
          <h2 id="activity-heading" className="mt-1 text-xl font-bold">Activity & records</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Once connected, your records will be available here and remain linked to your account.
          </p>
          <ul className="mt-5 divide-y">
            {activity.map(({ label, href, icon: Icon }) => (
              <li key={href}>
                <Link href={href} className="flex items-center justify-between gap-3 py-3 text-sm font-medium hover:text-foreground">
                  <span className="flex items-center gap-3">
                    <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                    {label}
                  </span>
                  <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  )
}
