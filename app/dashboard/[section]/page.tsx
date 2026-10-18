import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
  Activity,
  Award,
  Bell,
  BookOpen,
  CalendarDays,
  CircleHelp,
  ClipboardList,
  CreditCard,
  UserRound,
} from 'lucide-react'
import { EmptyState } from '@/components/site/blocks'
import { PanelAccessNotice, PanelPageHeading } from '@/components/dashboard/panel-shell'
import { ProfileEditor } from '@/components/dashboard/profile-editor'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const sections = {
  profile: {
    eyebrow: 'Account',
    title: 'My profile',
    description: 'Review your personal details and permanent participant ID.',
    emptyTitle: 'Your profile is not connected',
    emptyDescription: 'Profile details and participant IDs will appear here after account and database services are configured.',
    icon: UserRound,
  },
  events: {
    eyebrow: 'Learning',
    title: 'My events',
    description: 'See the events you have joined and what is coming up.',
    emptyTitle: 'No event activity to display',
    emptyDescription: 'Your event registrations and schedules will appear here after the account and event services are connected.',
    icon: CalendarDays,
  },
  workshops: {
    eyebrow: 'Learning',
    title: 'My workshops',
    description: 'Keep track of your workshop registrations and attendance.',
    emptyTitle: 'No workshop activity to display',
    emptyDescription: 'Registered workshops and participation information will appear here when real account data is available.',
    icon: BookOpen,
  },
  registrations: {
    eyebrow: 'Records',
    title: 'My registrations',
    description: 'Review registration IDs, dates, amounts, and confirmation status.',
    emptyTitle: 'No registrations to display',
    emptyDescription: 'Registration records will appear here after the registration service is connected. No sample records are shown.',
    icon: ClipboardList,
  },
  payments: {
    eyebrow: 'Records',
    title: 'Payment history',
    description: 'Review payment attempts and verified transaction statuses.',
    emptyTitle: 'No payment history to display',
    emptyDescription: 'Verified payment records will appear here after a payment provider and database are configured.',
    icon: CreditCard,
  },
  competitions: {
    eyebrow: 'Compete',
    title: 'My competitions',
    description: 'See competition registrations, schedules, and participation details.',
    emptyTitle: 'No competitions to display',
    emptyDescription: 'Your competition activity will appear when competition records and account services are connected.',
    icon: Activity,
  },
  results: {
    eyebrow: 'Compete',
    title: 'Submissions & results',
    description: 'Review your submission history and officially published results.',
    emptyTitle: 'No submissions or results to display',
    emptyDescription: 'Only stored submissions and verified, published results will appear here. No scores are being simulated.',
    icon: Activity,
  },
  certificates: {
    eyebrow: 'Achievements',
    title: 'My certificates',
    description: 'Download eligible certificates and check their verification details.',
    emptyTitle: 'No certificates to display',
    emptyDescription: 'Certificates will appear after they are issued through the eligibility and approval process.',
    icon: Award,
  },
  notifications: {
    eyebrow: 'Updates',
    title: 'Notifications',
    description: 'Stay up to date with registration, event, result, and certificate updates.',
    emptyTitle: 'No notifications to display',
    emptyDescription: 'Notifications will appear here after persistent notification storage is configured.',
    icon: Bell,
  },
  support: {
    eyebrow: 'Support',
    title: 'Help & support',
    description: 'Get help with your account, registrations, or event participation.',
    emptyTitle: 'Support inbox is not connected',
    emptyDescription: 'Contact options are available on the public Contact Us page while the support workflow is being configured.',
    icon: CircleHelp,
  },
} as const

type SectionKey = keyof typeof sections

export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string }>
}): Promise<Metadata> {
  const { section } = await params
  return { title: section in sections ? sections[section as SectionKey].title : 'Dashboard' }
}

export default async function DashboardSectionPage({
  params,
}: {
  params: Promise<{ section: string }>
}) {
  const { section } = await params
  if (!(section in sections)) notFound()
  const details = sections[section as SectionKey]
  const Icon = details.icon

  if (section === 'profile' || section === 'registrations' || section === 'events' || section === 'workshops' || section === 'payments') {
    const supabase = await createSupabaseServerClient()
    const { data: authData, error: authError } = supabase
      ? await supabase.auth.getUser()
      : { data: { user: null }, error: new Error('Supabase is not configured.') }

    if (!supabase || authError || !authData.user) {
      return (
        <>
          <PanelPageHeading eyebrow={details.eyebrow} title={details.title} description={details.description} />
          <PanelAccessNotice />
          <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            Your account records could not be loaded. Sign in again or verify the Supabase configuration.
          </p>
        </>
      )
    }

    if (section === 'profile') {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('full_name, email, mobile, organization, qualification, participant_id')
        .eq('id', authData.user.id)
        .maybeSingle()
      return (
        <>
          <PanelPageHeading eyebrow={details.eyebrow} title={details.title} description={details.description} />
          <PanelAccessNotice />
          {error || !profile ? (
            <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              Profile data could not be loaded. Apply the profiles migration and check its RLS policies.
            </p>
          ) : (
            <div className="flex flex-col gap-5">
              <div className="rounded-2xl bg-ink p-6 text-ink-foreground">
                <p className="text-xs font-bold uppercase tracking-widest text-gold">Permanent participant ID</p>
                <p className="mt-2 font-mono text-2xl font-bold">{profile.participant_id}</p>
                <p className="mt-2 text-sm text-ink-foreground/70">{profile.email}</p>
              </div>
              <ProfileEditor userId={authData.user.id} profile={profile} />
            </div>
          )}
        </>
      )
    }

    if (section === 'payments') {
      const { data: payments, error } = await supabase
        .from('payments')
        .select('id, registration_id, amount, utr, status, created_at')
        .eq('user_id', authData.user.id)
        .order('created_at', { ascending: false })
      const registrationIds = [...new Set(
        (payments ?? [])
          .map((payment) => payment.registration_id)
          .filter((id): id is string => typeof id === 'string'),
      )]
      const { data: registrations, error: registrationsError } = registrationIds.length
        ? await supabase.from('registrations').select('id, event_id').in('id', registrationIds)
        : { data: [], error: null }
      const eventIds = [...new Set((registrations ?? []).map((registration) => registration.event_id))]
      const { data: events, error: eventsError } = eventIds.length
        ? await supabase.from('events').select('id, title').in('id', eventIds)
        : { data: [], error: null }
      const registrationById = new Map((registrations ?? []).map((item) => [item.id, item]))
      const eventById = new Map((events ?? []).map((item) => [item.id, item]))
      return (
        <>
          <PanelPageHeading eyebrow={details.eyebrow} title={details.title} description={details.description} />
          <PanelAccessNotice />
          {error || registrationsError || eventsError ? (
            <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">Payment records could not be loaded. Apply the events migration and check its RLS policies.</p>
          ) : payments?.length ? (
            <ul className="grid gap-3">
              {payments.map((payment) => {
                const registration = registrationById.get(payment.registration_id)
                const title = registration ? eventById.get(registration.event_id)?.title : undefined
                return (
                  <li key={payment.id} className="rounded-xl border bg-card p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="font-semibold">{title ?? 'Event'}</h2>
                        <p className="mt-1 break-all text-sm text-muted-foreground">UPI reference: {payment.utr ?? 'Not recorded'}</p>
                      </div>
                      <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold capitalize">
                        {payment.status ?? 'Legacy record — not linked to a registration'}
                      </span>
                    </div>
                    <p className="mt-3 text-sm">₹{Number(payment.amount).toFixed(2)} · {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(payment.created_at))}</p>
                  </li>
                )
              })}
            </ul>
          ) : (
            <EmptyState icon={Icon} title={details.emptyTitle} description={details.emptyDescription} />
          )}
        </>
      )
    }

    const { data: registrations, error } = await supabase
      .from('registrations')
      .select('id, event_id, status, payment_status, amount, created_at')
      .eq('user_id', authData.user.id)
      .order('created_at', { ascending: false })
    const eventIds = [...new Set((registrations ?? []).map((registration) => registration.event_id))]
    const { data: events, error: eventError } = eventIds.length
      ? await supabase.from('events').select('id, title, category, event_date').in('id', eventIds)
      : { data: [], error: null }
    const eventById = new Map((events ?? []).map((event) => [event.id, event]))
    const visibleRegistrations = (registrations ?? []).filter((registration) => {
      if (section === 'workshops') return eventById.get(registration.event_id)?.category === 'Workshop'
      if (section === 'events') return eventById.get(registration.event_id)?.category !== 'Workshop'
      return true
    })
    return (
      <>
        <PanelPageHeading eyebrow={details.eyebrow} title={details.title} description={details.description} />
        <PanelAccessNotice />
        {error || eventError ? (
          <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">Registration records could not be loaded. Apply the events migration and check its RLS policies.</p>
        ) : visibleRegistrations.length ? (
          <ul className="grid gap-3">
            {visibleRegistrations.map((registration) => {
              const event = eventById.get(registration.event_id)
              return (
                <li key={registration.id} className="rounded-xl border bg-card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="font-semibold">{event?.title ?? 'Event'}</h2>
                      <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{registration.id}</p>
                    </div>
                    <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold capitalize">{registration.status}</span>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">
                    Payment: {registration.payment_status.replace('_', ' ')} · {Number(registration.amount) === 0 ? 'Free' : `₹${Number(registration.amount).toFixed(2)}`}
                    {event?.event_date ? ` · ${new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(event.event_date))}` : ''}
                  </p>
                </li>
              )
            })}
          </ul>
        ) : (
          <EmptyState icon={Icon} title={details.emptyTitle} description={details.emptyDescription} action={{ href: '/events', label: 'Explore events' }} />
        )}
      </>
    )
  }

  return (
    <>
      <PanelPageHeading eyebrow={details.eyebrow} title={details.title} description={details.description} />
      <PanelAccessNotice />
      <EmptyState icon={Icon} title={details.emptyTitle} description={details.emptyDescription} />
    </>
  )
}
