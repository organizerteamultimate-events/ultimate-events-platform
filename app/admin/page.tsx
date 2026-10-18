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
  { label: 'Reports & exports', href: '/admin/reports', icon: FileBarChart },
]

export default async function AdminDashboardPage() {
  const supabase = await createSupabaseServerClient()
  let metrics = { users: null as number | null, events: null as number | null, registrations: null as number | null, payments: null as number | null }
  let metricsError: string | null = null

  if (supabase) {
    const [users, events, registrations, payments] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('events').select('id', { count: 'exact', head: true }).eq('status', 'published'),
      supabase.from('registrations').select('id', { count: 'exact', head: true }),
      supabase.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'verified'),
    ])
    if (users.error || events.error || registrations.error || payments.error) {
      metricsError = 'Live metrics are unavailable. Apply the events migration and check Supabase RLS policies.'
    } else {
      metrics = {
        users: users.count ?? 0,
        events: events.count ?? 0,
        registrations: registrations.count ?? 0,
        payments: payments.count ?? 0,
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
          <h2 id="recent-activity-heading" className="mb-4 mt-1 text-xl font-bold">Recent activity</h2>
          <EmptyState
            icon={Activity}
            title="No activity records"
            description="Audit logs, registrations, and platform updates will appear here once the database and admin services are connected."
            className="h-[calc(100%-3.25rem)]"
          />
        </section>
      </div>
    </>
  )
}
