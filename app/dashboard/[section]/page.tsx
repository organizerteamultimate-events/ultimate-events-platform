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
import { requireParticipantAccess } from '@/lib/supabase/access'
import { ParticipantSubmissionManager, type ParticipantCompetitionRecord } from '@/components/dashboard/participant-submission-manager'
import { ParticipantNotifications, type ParticipantNotification } from '@/components/dashboard/participant-notifications'

const sections = {
  profile: {
    eyebrow: 'Account',
    title: 'My profile',
    description: 'Review your personal details and permanent participant ID.',
    emptyTitle: 'Your profile is not connected',
    emptyDescription: 'Your profile could not be loaded. Reload the page or contact support if the problem continues.',
    icon: UserRound,
  },
  events: {
    eyebrow: 'Learning',
    title: 'My events',
    description: 'See the events you have joined and what is coming up.',
    emptyTitle: 'No event activity to display',
    emptyDescription: 'Your published event registrations will appear here after you join an event.',
    icon: CalendarDays,
  },
  workshops: {
    eyebrow: 'Learning',
    title: 'My workshops',
    description: 'Keep track of your workshop registrations and attendance.',
    emptyTitle: 'No workshop activity to display',
    emptyDescription: 'Your workshop registrations will appear here after you join a published workshop.',
    icon: BookOpen,
  },
  registrations: {
    eyebrow: 'Records',
    title: 'My registrations',
    description: 'Review registration IDs, dates, amounts, and confirmation status.',
    emptyTitle: 'No registrations to display',
    emptyDescription: 'Your event and workshop registrations will appear here after you register.',
    icon: ClipboardList,
  },
  payments: {
    eyebrow: 'Records',
    title: 'Payment history',
    description: 'Review your manual UPI payment references and verification status.',
    emptyTitle: 'No payment history to display',
    emptyDescription: 'Payment submissions will appear here after you register for a paid event and submit a receipt.',
    icon: CreditCard,
  },
  competitions: {
    eyebrow: 'Compete',
    title: 'My competitions',
    description: 'See competition registrations, schedules, and participation details.',
    emptyTitle: 'No competitions to display',
    emptyDescription: 'Your competition registrations will appear here after you join a published competition.',
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
    emptyDescription: 'You do not have any stored notifications yet.',
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
  await requireParticipantAccess()

  const { section } = await params
  if (!(section in sections)) notFound()
  const details = sections[section as SectionKey]
  const Icon = details.icon

  if (section === 'results') {
    const supabase = await createSupabaseServerClient()
    const { data: authData, error: authError } = supabase
      ? await supabase.auth.getUser()
      : { data: { user: null }, error: new Error('Supabase is not configured.') }
    if (!supabase || authError || !authData.user) {
      return (
        <>
          <PanelPageHeading eyebrow={details.eyebrow} title={details.title} description={details.description} />
          <PanelAccessNotice />
          <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">Your competition records could not be loaded. Sign in again or verify the Supabase configuration.</p>
        </>
      )
    }

    const [{ data: registrations, error: registrationError }, { data: submissions, error: submissionError }] = await Promise.all([
      supabase.from('registrations').select('id, event_id').eq('user_id', authData.user.id).eq('status', 'confirmed'),
      supabase.from('submissions')
        .select('id, registration_id, event_id, submission_url, notes, status, score, feedback, submitted_at')
        .eq('user_id', authData.user.id)
        .order('submitted_at', { ascending: false }),
    ])
    const eventIds = [...new Set((registrations ?? []).map((registration) => registration.event_id))]
    const [{ data: events, error: eventsError }] = eventIds.length
      ? await Promise.all([
          supabase.from('events').select('id, title, category').in('id', eventIds),
        ])
      : [{ data: [], error: null }]
    const submissionByRegistration = new Map((submissions ?? []).map((submission) => [submission.registration_id, submission]))
    const eventById = new Map((events ?? []).map((event) => [event.id, event]))
    const competitions: ParticipantCompetitionRecord[] = (registrations ?? [])
      .flatMap((registration) => {
        const event = eventById.get(registration.event_id)
        if (!event?.category.toLowerCase().includes('competition')) return []
        const submission = submissionByRegistration.get(registration.id)
        return [{
          registration_id: registration.id,
          event_id: event.id,
          event_title: event.title,
          submission: submission ? {
            id: submission.id,
            submission_url: submission.submission_url,
            notes: submission.notes,
            status: submission.status,
            score: submission.score,
            feedback: submission.feedback,
            submitted_at: submission.submitted_at,
          } : null,
        }]
      })

    return (
      <>
        <PanelPageHeading eyebrow={details.eyebrow} title={details.title} description={details.description} />
        <PanelAccessNotice />
        <ParticipantSubmissionManager
          competitions={competitions}
          userId={authData.user.id}
          loadError={registrationError || submissionError || eventsError ? 'Competition submissions could not be loaded. Apply the participant workflows migration and verify event access policies.' : null}
        />
      </>
    )
  }

  if (section === 'certificates') {
    const supabase = await createSupabaseServerClient()
    const { data: authData, error: authError } = supabase
      ? await supabase.auth.getUser()
      : { data: { user: null }, error: new Error('Supabase is not configured.') }
    const { data: certificates, error } = supabase && authData.user
      ? await supabase.from('certificates')
          .select('id, certificate_number, participant_id, event_name, issued_at, revoked_at')
          .eq('user_id', authData.user.id)
          .order('issued_at', { ascending: false })
      : { data: null, error: authError ?? new Error('Authentication required.') }
    return (
      <>
        <PanelPageHeading eyebrow={details.eyebrow} title={details.title} description={details.description} />
        <PanelAccessNotice />
        {error ? (
          <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">Certificates could not be loaded. Apply the participant workflows migration and verify your account.</p>
        ) : certificates?.length ? (
          <ul className="grid gap-3">
            {certificates.map((certificate) => (
              <li key={certificate.id} className="flex flex-col justify-between gap-4 rounded-xl border bg-card p-5 sm:flex-row sm:items-center">
                <div>
                  <h2 className="font-semibold">{certificate.event_name}</h2>
                  <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{certificate.certificate_number} · {certificate.participant_id}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{certificate.revoked_at ? 'Revoked' : 'Active'} · {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(certificate.issued_at))}</p>
                </div>
                {!certificate.revoked_at && (
                  <div className="flex flex-wrap gap-2">
                    <a href={`/api/certificates/${certificate.id}`} className="inline-flex h-10 items-center justify-center rounded-lg bg-gold px-4 text-sm font-semibold text-gold-foreground">Download PDF</a>
                    <a href={`/verify-certificate?certificate=${encodeURIComponent(certificate.certificate_number)}`} className="inline-flex h-10 items-center justify-center rounded-lg border px-4 text-sm font-semibold">Verify</a>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={Icon} title={details.emptyTitle} description={details.emptyDescription} />
        )}
      </>
    )
  }

  if (section === 'notifications') {
    const supabase = await createSupabaseServerClient()
    const { data: authData, error: authError } = supabase
      ? await supabase.auth.getUser()
      : { data: { user: null }, error: new Error('Supabase is not configured.') }
    const { data: notifications, error } = supabase && authData.user
      ? await supabase.from('notifications')
          .select('id, kind, title, message, created_at, read_at')
          .eq('user_id', authData.user.id)
          .order('created_at', { ascending: false })
          .limit(200)
      : { data: null, error: authError ?? new Error('Authentication required.') }
    return (
      <>
        <PanelPageHeading eyebrow={details.eyebrow} title={details.title} description={details.description} />
        <PanelAccessNotice />
        <ParticipantNotifications
          notifications={(notifications ?? []) as ParticipantNotification[]}
          loadError={error ? 'Notifications could not be loaded. Apply the participant workflows migration and verify your account.' : null}
        />
      </>
    )
  }

  if (section === 'profile' || section === 'registrations' || section === 'events' || section === 'workshops' || section === 'payments' || section === 'competitions') {
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
        .select('id, registration_id, amount, utr, status, rejection_reason, created_at')
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
                        {payment.status === 'pending' ? 'Pending Verification' : payment.status === 'verified' ? 'Verified' : payment.status === 'rejected' ? 'Rejected' : 'Legacy record — not linked to a registration'}
                      </span>
                    </div>
                    {payment.rejection_reason && (
                      <p className="mt-2 whitespace-pre-wrap text-sm text-destructive">
                        Rejection reason: {payment.rejection_reason}
                      </p>
                    )}
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
      if (section === 'competitions') return eventById.get(registration.event_id)?.category.toLowerCase().includes('competition')
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
                    Payment: {registration.payment_status === 'pending' ? 'Pending Verification' : registration.payment_status === 'verified' ? 'Verified' : registration.payment_status === 'rejected' ? 'Rejected' : registration.payment_status.replace('_', ' ')} · {Number(registration.amount) === 0 ? 'Free' : `₹${Number(registration.amount).toFixed(2)}`}
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
