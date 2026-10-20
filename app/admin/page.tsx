import Link from 'next/link'
import {
  Activity,
  Award,
  CalendarDays,
  ClipboardList,
  CreditCard,
  FileBarChart,
  Plus,
  Users,
} from 'lucide-react'
import { PanelAccessNotice, PanelPageHeading, PanelStat } from '@/components/dashboard/panel-shell'
import { EmptyState } from '@/components/site/blocks'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const managementLinks = [
  { label: 'Manage events & workshops', href: '/admin/events', icon: CalendarDays },
  { label: 'Review users', href: '/admin/users', icon: Users },
  { label: 'View registrations', href: '/admin/registrations', icon: ClipboardList },
  { label: 'Review payments', href: '/admin/payments', icon: CreditCard },
  { label: 'Competition submissions', href: '/admin/submissions', icon: Activity },
  { label: 'Certificates & awards', href: '/admin/certificates', icon: Award },
  { label: 'UPI payment settings', href: '/admin/settings', icon: CreditCard },
  { label: 'Reports & exports', href: '/admin/reports', icon: FileBarChart },
]

export default async function AdminDashboardPage() {
  const supabase = await createSupabaseServerClient()
  let metrics = { users: null as number | null, events: null as number | null, registrations: null as number | null, payments: null as number | null }
  let recent: Array<{ id: string; event_title: string; participant_name: string; status: string; created_at: string }> = []
  let metricsError: string | null = null

  if (supabase) {
    const [users, events, registrations, payments, recentRegistrations] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('events').select('id', { count: 'exact', head: true }).eq('status', 'published'),
      supabase.from('registrations').select('id', { count: 'exact', head: true }),
      supabase.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'verified'),
      supabase.from('registrations').select('id, event_id, user_id, status, created_at').order('created_at', { ascending: false }).limit(5),
    ])
    if (users.error || events.error || registrations.error || payments.error || recentRegistrations.error) {
      metricsError = 'Live metrics are unavailable. Apply the events migration and check Supabase RLS policies.'
    } else {
      metrics = {
        users: users.count ?? 0,
        events: events.count ?? 0,
        registrations: registrations.count ?? 0,
        payments: payments.count ?? 0,
      }
      if (recentRegistrations.data?.length) {
        const eventIds = [...new Set(recentRegistrations.data.map((registration) => registration.event_id))]
        const userIds = [...new Set(recentRegistrations.data.map((registration) => registration.user_id))]
        const [{ data: eventRows, error: eventError }, { data: profileRows, error: profileError }] = await Promise.all([
          supabase.from('events').select('id, title').in('id', eventIds),
          supabase.from('profiles').select('id, full_name').in('id', userIds),
        ])
        if (eventError || profileError) {
          metricsError = 'Recent registrations could not be completed with participant and event details.'
        } else {
          const eventById = new Map((eventRows ?? []).map((event) => [event.id, event.title]))
          const profileById = new Map((profileRows ?? []).map((profile) => [profile.id, profile.full_name]))
          recent = recentRegistrations.data.map((registration) => ({
            id: registration.id,
            event_title: eventById.get(registration.event_id) ?? 'Event',
            participant_name: profileById.get(registration.user_id) ?? 'Participant',
            status: registration.status,
            created_at: registration.created_at,
          }))
        }
      }
    }
  }

  return (
    <>
      <PanelPageHeading
        eyebrow="Platform administration"
        title="Admin overview"
        description="Manage events, users, registrations, competitions, payments, and platform operations."
        action={{ href: '/admin/events', label: 'Create event' }}
      />
      <PanelAccessNotice admin />
      {metricsError && <p role="alert" className="mb-5 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{metricsError}</p>}

      <section aria-label="Platform metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <PanelStat label="Registered users" icon="users" value={metrics.users?.toLocaleString() ?? '—'} detail="Profiles in Supabase" />
        <PanelStat label="Published events" icon="calendar" value={metrics.events?.toLocaleString() ?? '—'} detail="Visible to participants" />
        <PanelStat label="Registrations" icon="clipboard" value={metrics.registrations?.toLocaleString() ?? '—'} detail="All stored registrations" />
        <PanelStat label="Verified payments" icon="credit" value={metrics.payments?.toLocaleString() ?? '—'} detail="Admin-verified UPI payments" />
      </section>

      <div className="mt-8 grid gap-8 xl:grid-cols-[1.25fr_0.75fr]">
        <section aria-labelledby="admin-actions-heading">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Workspace</p>
          <h2 id="admin-actions-heading" className="mb-4 mt-1 text-xl font-bold">Management areas</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {managementLinks.map(({ label, href, icon: Icon }) => (
              <li key={href}>
                <Link href={href} className="flex items-center gap-4 rounded-2xl border bg-card p-5 shadow-sm transition-colors hover:border-gold">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-accent">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="flex-1 font-semibold">{label}</span>
                  <Plus className="size-4 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="recent-activity-heading">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Monitoring</p>
          <h2 id="recent-activity-heading" className="mb-4 mt-1 text-xl font-bold">Recent registrations</h2>
          {recent.length ? (
            <ul className="grid gap-3">
              {recent.map((registration) => (
                <li key={registration.id} className="rounded-xl border bg-card p-4">
                  <p className="font-semibold">{registration.event_title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{registration.participant_name} · <span className="capitalize">{registration.status}</span></p>
                  <p className="mt-1 text-xs text-muted-foreground">{new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(registration.created_at))}</p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={Activity} title="No registrations yet" description="New participant registrations will appear here." className="h-[calc(100%-3.25rem)]" />
          )}
        </section>
      </div>
    </>
  )
}
