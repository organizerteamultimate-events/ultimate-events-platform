import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
  Activity,
  Award,
  Bell,
  CalendarDays,
  ClipboardList,
  CreditCard,
  FileBarChart,
  FileText,
  Medal,
  Settings,
  Shield,
  Trophy,
  Users,
} from 'lucide-react'
import { PanelAccessNotice, PanelPageHeading } from '@/components/dashboard/panel-shell'
import { EmptyState } from '@/components/site/blocks'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { EventRecord } from '@/lib/events'
import { AdminEventManager } from '@/components/dashboard/admin-event-manager'
import { AdminPaymentReview, type AdminPaymentRecord } from '@/components/dashboard/admin-payment-review'
import { AdminRegistrationList, type AdminRegistrationRecord } from '@/components/dashboard/admin-registration-list'
import { AdminParticipantManager, type AdminParticipantRecord } from '@/components/dashboard/admin-participant-manager'
import { AdminPaymentSettings } from '@/components/dashboard/admin-payment-settings'
import { AdminSubmissionReview, type AdminSubmissionRecord } from '@/components/dashboard/admin-submission-review'
import { AdminWinnerManager, type AdminWinnerRecord, type WinnerCandidate } from '@/components/dashboard/admin-winner-manager'
import { AdminCertificateManager, type AdminCertificateRecord, type CompletedEventRecord } from '@/components/dashboard/admin-certificate-manager'

const sections = {
  users: {
    title: 'Users',
    description: 'Search participant accounts, review verification status, and inspect registration history.',
    empty: 'User records are not connected',
    detail: 'User search and account management require the configured database and server-side admin authorization.',
    icon: Users,
  },
  events: {
    title: 'Events & workshops',
    description: 'Create, edit, publish, cancel, and archive events and workshops.',
    empty: 'No event records',
    detail: 'Event management will be available after the event database and protected admin APIs are configured.',
    icon: CalendarDays,
  },
  registrations: {
    title: 'Registrations',
    description: 'Review event registrations, capacity, eligibility, and confirmation status.',
    empty: 'No registration records',
    detail: 'Registration records and exports will appear when persistent registration services are available.',
    icon: ClipboardList,
  },
  payments: {
    title: 'Payments',
    description: 'Review payment attempts and provider-verified transactions.',
    empty: 'No payment records',
    detail: 'Payment management requires a configured payment provider, webhook verification, and database.',
    icon: CreditCard,
  },
  competitions: {
    title: 'Competitions',
    description: 'Configure competition schedules, problem statements, and judging settings.',
    empty: 'No competition records',
    detail: 'Competition data will appear after the database and competition services are connected.',
    icon: Trophy,
  },
  submissions: {
    title: 'Submissions',
    description: 'Review participant submissions and status from the configured judging service.',
    empty: 'No submissions',
    detail: 'Submission records will appear when the competition database is configured. Code execution is not enabled here.',
    icon: Activity,
  },
  leaderboard: {
    title: 'Leaderboard',
    description: 'Review verified competition scores before publishing official rankings.',
    empty: 'No verified scores',
    detail: 'Rankings will be based on verified judging results; no participant scores are fabricated.',
    icon: Medal,
  },
  winners: {
    title: 'Winners',
    description: 'Review and publish official competition results.',
    empty: 'No official winners',
    detail: 'Winners will only appear after authorized review and publication of verified results.',
    icon: Award,
  },
  certificates: {
    title: 'Certificates',
    description: 'Review eligibility and manage certificate issue, revocation, and reissue.',
    empty: 'No certificates',
    detail: 'Certificate management requires the eligibility workflow, persistent records, and PDF generation service.',
    icon: FileText,
  },
  announcements: {
    title: 'Email announcements',
    description: 'Prepare recipient segments, preview announcements, and review delivery logs.',
    empty: 'Email delivery is not configured',
    detail: 'No messages will be sent until an email provider, sender domain, consent handling, and delivery logging are configured.',
    icon: Bell,
  },
  reports: {
    title: 'Reports',
    description: 'Review database-derived platform metrics and export authorized CSV reports.',
    empty: 'Reports are not connected',
    detail: 'Reports will only show genuine database records after the data and authorization services are configured.',
    icon: FileBarChart,
  },
  'audit-logs': {
    title: 'Audit logs',
    description: 'Review an auditable history of sensitive administrator actions.',
    empty: 'No audit records',
    detail: 'Audit logging must be configured before sensitive management actions can be enabled.',
    icon: Shield,
  },
  settings: {
    title: 'Settings',
    description: 'Manage public platform settings and registration rules.',
    empty: 'Platform settings are not connected',
    detail: 'Sensitive provider credentials must be configured as server-side environment secrets, not entered here.',
    icon: Settings,
  },
} as const

type SectionKey = keyof typeof sections

export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string }>
}): Promise<Metadata> {
  const { section } = await params
  return { title: section in sections ? sections[section as SectionKey].title : 'Admin' }
}

export default async function AdminSectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>
  searchParams: Promise<{ q?: string }>
}) {
  const [{ section }, query] = await Promise.all([params, searchParams])
  if (!(section in sections)) notFound()
  const details = sections[section as SectionKey]
  const Icon = details.icon

  if (section === 'users') {
    const supabase = await createSupabaseServerClient()
    const search = (query.q ?? '').trim().slice(0, 200)
    const { data, error } = supabase
      ? await supabase.rpc('admin_search_participants', {
          p_query: search,
          p_limit: 100,
          p_offset: 0,
        })
      : { data: null, error: new Error('Supabase is not configured.') }
    return (
      <>
        <PanelPageHeading eyebrow="Administration" title={details.title} description={details.description} />
        <PanelAccessNotice admin />
        <AdminParticipantManager
          participants={(data ?? []) as AdminParticipantRecord[]}
          search={search}
          loadError={error ? 'Participant records could not be loaded. Apply the participant workflows migration and verify admin access.' : null}
        />
      </>
    )
  }

  if (section === 'events') {
    const supabase = await createSupabaseServerClient()
    const { data, error } = supabase
      ? await supabase
          .from('events')
          .select('id, title, category, description, event_date, registration_opens_at, registration_deadline, capacity, price, status, created_at')
          .order('created_at', { ascending: false })
      : { data: null, error: new Error('Supabase is not configured.') }

    return (
      <>
        <PanelPageHeading eyebrow="Administration" title={details.title} description={details.description} />
        <PanelAccessNotice admin />
        <AdminEventManager
          events={(data ?? []) as EventRecord[]}
          loadError={error ? 'Event records could not be loaded. Check the event columns and RLS policies in the connected database.' : null}
        />
      </>
    )
  }

  if (section === 'payments') {
    const supabase = await createSupabaseServerClient()
    const { data: paymentData, error: paymentError } = supabase
      ? await supabase
          .from('payments')
          .select('id, registration_id, user_id, amount, utr, created_at')
          .eq('status', 'pending')
          .order('created_at', { ascending: true })
      : { data: null, error: new Error('Supabase is not configured.') }

    let payments: AdminPaymentRecord[] = []
    let loadError = paymentError
      ? 'Payment records could not be loaded. Apply the events migration and verify admin access.'
      : null

    if (supabase && paymentData?.length) {
      const registrationIds = paymentData.map((payment) => payment.registration_id)
      const userIds = [...new Set(paymentData.map((payment) => payment.user_id))]
      const [{ data: registrationData, error: registrationError }, { data: profileData, error: profileError }] =
        await Promise.all([
          supabase.from('registrations').select('id, event_id').in('id', registrationIds),
          supabase.from('profiles').select('id, full_name, participant_id').in('id', userIds),
        ])
      const eventIds = [...new Set((registrationData ?? []).map((registration) => registration.event_id))]
      const { data: eventData, error: eventError } = eventIds.length
        ? await supabase.from('events').select('id, title').in('id', eventIds)
        : { data: [], error: null }

      if (registrationError || profileError || eventError) {
        loadError = 'Payment details could not be completed. Check the profile and events RLS policies.'
      } else {
        const registrations = new Map((registrationData ?? []).map((row) => [row.id, row]))
        const profiles = new Map((profileData ?? []).map((row) => [row.id, row]))
        const events = new Map((eventData ?? []).map((row) => [row.id, row]))
        payments = paymentData.map((payment) => {
          const registration = registrations.get(payment.registration_id)
          const profile = profiles.get(payment.user_id)
          return {
            ...payment,
            participant_name: profile?.full_name ?? 'Participant',
            participant_id: profile?.participant_id ?? 'Unavailable',
            event_title: (registration && events.get(registration.event_id)?.title) ?? 'Event',
          } as AdminPaymentRecord
        })
      }
    }

    return (
      <>
        <PanelPageHeading eyebrow="Administration" title={details.title} description={details.description} />
        <PanelAccessNotice admin />
        <AdminPaymentReview payments={payments} loadError={loadError} />
      </>
    )
  }

  if (section === 'registrations') {
    const supabase = await createSupabaseServerClient()
    const { data: registrationData, error: registrationError } = supabase
      ? await supabase
          .from('registrations')
          .select('id, event_id, user_id, status, payment_status, amount, created_at')
          .order('created_at', { ascending: false })
      : { data: null, error: new Error('Supabase is not configured.') }
    let registrations: AdminRegistrationRecord[] = []
    let loadError = registrationError
      ? 'Registration records could not be loaded. Apply the events migration and verify admin access.'
      : null

    if (supabase && registrationData?.length) {
      const eventIds = [...new Set(registrationData.map((registration) => registration.event_id))]
      const userIds = [...new Set(registrationData.map((registration) => registration.user_id))]
      const [{ data: eventData, error: eventError }, { data: profileData, error: profileError }] =
        await Promise.all([
          supabase.from('events').select('id, title').in('id', eventIds),
          supabase.from('profiles').select('id, full_name, participant_id').in('id', userIds),
        ])
      if (eventError || profileError) {
        loadError = 'Registration details could not be loaded. Check the profiles and events RLS policies.'
      } else {
        const events = new Map((eventData ?? []).map((row) => [row.id, row]))
        const profiles = new Map((profileData ?? []).map((row) => [row.id, row]))
        registrations = registrationData.map((registration) => ({
          ...registration,
          participant_name: profiles.get(registration.user_id)?.full_name ?? 'Participant',
          participant_id: profiles.get(registration.user_id)?.participant_id ?? 'Unavailable',
          event_title: events.get(registration.event_id)?.title ?? 'Event',
        })) as AdminRegistrationRecord[]
      }
    }

    return (
      <>
        <PanelPageHeading eyebrow="Administration" title={details.title} description={details.description} />
        <PanelAccessNotice admin />
        <AdminRegistrationList registrations={registrations} loadError={loadError} />
      </>
    )
  }

    if (section === 'settings') {
      const supabase = await createSupabaseServerClient()
      const { data, error } = supabase
        ? await supabase
            .from('platform_settings')
            .select('upi_id, payment_instructions')
            .eq('id', true)
            .maybeSingle()
        : { data: null, error: new Error('Supabase is not configured.') }

      return (
        <>
          <PanelPageHeading eyebrow="Administration" title={details.title} description={details.description} />
          <PanelAccessNotice admin />
          <AdminPaymentSettings
            initialUpiId={data?.upi_id ?? ''}
            initialInstructions={data?.payment_instructions ?? ''}
            loadError={error ? 'Payment settings could not be loaded. Apply the participant workflows migration and verify admin access.' : null}
          />
        </>
      )
    }

    if (section === 'submissions') {
      const supabase = await createSupabaseServerClient()
      const { data: submissions, error: submissionError } = supabase
        ? await supabase
            .from('submissions')
            .select('id, event_id, user_id, submission_url, notes, status, score, feedback, submitted_at')
            .order('submitted_at', { ascending: false })
        : { data: null, error: new Error('Supabase is not configured.') }
      let rows: AdminSubmissionRecord[] = []
      let loadError = submissionError
        ? 'Submission records could not be loaded. Apply the participant workflows migration and verify admin access.'
        : null

      if (supabase && submissions?.length) {
        const eventIds = [...new Set(submissions.map((submission) => submission.event_id))]
        const userIds = [...new Set(submissions.map((submission) => submission.user_id))]
        const [{ data: events, error: eventError }, { data: profiles, error: profileError }] = await Promise.all([
          supabase.from('events').select('id, title').in('id', eventIds),
          supabase.from('profiles').select('id, full_name, participant_id').in('id', userIds),
        ])
        if (eventError || profileError) {
          loadError = 'Submission participant or event details could not be loaded.'
        } else {
          const eventById = new Map((events ?? []).map((event) => [event.id, event]))
          const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]))
          rows = submissions.map((submission) => ({
            ...submission,
            event_title: eventById.get(submission.event_id)?.title ?? 'Event',
            participant_name: profileById.get(submission.user_id)?.full_name ?? 'Participant',
            participant_id: profileById.get(submission.user_id)?.participant_id ?? 'Unavailable',
          })) as AdminSubmissionRecord[]
        }
      }
      return (
        <>
          <PanelPageHeading eyebrow="Administration" title={details.title} description={details.description} />
          <PanelAccessNotice admin />
          <AdminSubmissionReview submissions={rows} loadError={loadError} />
        </>
      )
    }

    if (section === 'winners') {
      const supabase = await createSupabaseServerClient()
      const [{ data: submissions, error: submissionError }, { data: savedWinners, error: winnerError }] = supabase
        ? await Promise.all([
            supabase.from('submissions').select('event_id, user_id').eq('status', 'accepted'),
            supabase.from('winners').select('id, event_id, user_id, place, award_title, published').order('created_at', { ascending: false }),
          ])
        : [
            { data: null, error: new Error('Supabase is not configured.') },
            { data: null, error: new Error('Supabase is not configured.') },
          ]
      let candidates: WinnerCandidate[] = []
      let winners: AdminWinnerRecord[] = []
      let loadError = submissionError || winnerError
        ? 'Eligible winner candidates could not be loaded. Apply the participant workflows migration and verify admin access.'
        : null
      if (supabase && (submissions?.length || savedWinners?.length)) {
        const eventIds = [...new Set([
          ...(submissions ?? []).map((submission) => submission.event_id),
          ...(savedWinners ?? []).map((winner) => winner.event_id),
        ])]
        const userIds = [...new Set([
          ...(submissions ?? []).map((submission) => submission.user_id),
          ...(savedWinners ?? []).map((winner) => winner.user_id),
        ])]
        const [{ data: events, error: eventError }, { data: profiles, error: profileError }] = await Promise.all([
          supabase.from('events').select('id, title, status').in('id', eventIds),
          supabase.from('profiles').select('id, full_name, participant_id').in('id', userIds),
        ])
        if (eventError || profileError) {
          loadError = 'Winner candidate details could not be loaded.'
        } else {
          const completedEvents = new Map((events ?? []).map((event) => [event.id, event]))
          const participants = new Map((profiles ?? []).map((profile) => [profile.id, profile]))
          candidates = (submissions ?? []).flatMap((submission) => {
            const event = completedEvents.get(submission.event_id)
            const profile = participants.get(submission.user_id)
            return event?.status === 'completed' && profile
              ? [{
                  event_id: event.id,
                  event_title: event.title,
                  user_id: profile.id,
                  participant_name: profile.full_name,
                  participant_id: profile.participant_id,
                }]
              : []
          })
          winners = (savedWinners ?? []).flatMap((winner) => {
            const event = completedEvents.get(winner.event_id)
            const profile = participants.get(winner.user_id)
            return event && profile
              ? [{
                  id: winner.id,
                  event_id: event.id,
                  event_title: event.title,
                  user_id: profile.id,
                  participant_name: profile.full_name,
                  participant_id: profile.participant_id,
                  place: winner.place,
                  award_title: winner.award_title,
                  published: winner.published,
                }]
              : []
          })
        }
      }
      return (
        <>
          <PanelPageHeading eyebrow="Administration" title={details.title} description={details.description} />
          <PanelAccessNotice admin />
          <AdminWinnerManager candidates={candidates} winners={winners} loadError={loadError} />
        </>
      )
    }

    if (section === 'certificates') {
      const supabase = await createSupabaseServerClient()
      const [{ data: eventData, error: eventError }, { data: certificateData, error: certificateError }] = supabase
        ? await Promise.all([
            supabase.from('events').select('id, title').eq('status', 'completed').order('event_date', { ascending: false }),
            supabase.from('certificates')
              .select('id, certificate_number, recipient_name, participant_id, event_name, issued_at, revoked_at')
              .order('issued_at', { ascending: false })
              .limit(500),
          ])
        : [
            { data: null, error: new Error('Supabase is not configured.') },
            { data: null, error: new Error('Supabase is not configured.') },
          ]
      return (
        <>
          <PanelPageHeading eyebrow="Administration" title={details.title} description={details.description} />
          <PanelAccessNotice admin />
          <AdminCertificateManager
            events={(eventData ?? []) as CompletedEventRecord[]}
            certificates={(certificateData ?? []) as AdminCertificateRecord[]}
            loadError={eventError || certificateError ? 'Certificate records could not be loaded. Apply the participant workflows migration and verify admin access.' : null}
          />
        </>
      )
    }

  return (
    <>
      <PanelPageHeading eyebrow="Administration" title={details.title} description={details.description} />
      <PanelAccessNotice admin />
      <EmptyState icon={Icon} title={details.empty} description={details.detail} />
    </>
  )
}
