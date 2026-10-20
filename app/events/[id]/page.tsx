import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader, SetupNotice } from '@/components/site/blocks'
import { EventRegistration } from '@/components/events/event-registration'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/supabase/config'

export const metadata: Metadata = { title: 'Event details' }

export default async function EventDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  if (!isSupabaseConfigured()) {
    return (
      <>
        <PageHeader eyebrow="Event details" title="Event registration" />
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6"><SetupNotice feature="Event registration" /></div>
      </>
    )
  }

  const supabase = await createSupabaseServerClient()
  if (!supabase) notFound()
  const { data: event, error } = await supabase
    .from('events')
    .select('id, title, category, description, event_date, registration_opens_at, registration_deadline, capacity, price, status')
    .eq('id', id)
    .eq('status', 'published')
    .maybeSingle()
  if (error) {
    return (
      <>
        <PageHeader eyebrow="Event details" title="Event details unavailable" />
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
          <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            Event data could not be loaded. Apply the events migration in Supabase and reload this page.
          </p>
        </div>
      </>
    )
  }
  if (!event) notFound()

  const { data: authData } = await supabase.auth.getUser()
  const { data: paymentSettings, error: paymentSettingsError } = await supabase
    .from('platform_settings')
    .select('upi_id, payment_instructions')
    .eq('id', true)
    .maybeSingle()
  let registration: { id: string; status: string; payment_status: string } | null = null
  let hasPendingPayment = false
  if (authData.user) {
    const { data: existing } = await supabase
      .from('registrations')
      .select('id, status, payment_status')
      .eq('event_id', id)
      .eq('user_id', authData.user.id)
      .maybeSingle()
    registration = existing
    if (existing) {
      const { data: payment } = await supabase
        .from('payments')
        .select('id')
        .eq('registration_id', existing.id)
        .eq('status', 'pending')
        .maybeSingle()
      hasPendingPayment = Boolean(payment)
    }
  }

  return (
    <>
      <PageHeader
        eyebrow={event.category}
        title={event.title}
        description={event.description || 'Event details will be shared with registered participants.'}
      />
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_380px]">
        <section className="rounded-2xl border bg-card p-6 sm:p-8">
          <h2 className="text-xl font-bold">Event information</h2>
          <dl className="mt-6 grid gap-5 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Date and time</dt>
              <dd className="mt-1 font-medium">
                {event.event_date
                  ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'full', timeStyle: 'short' }).format(new Date(event.event_date))
                  : 'To be announced'}
              </dd>
            </div>
            {event.registration_opens_at && (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Registration opens</dt>
                <dd className="mt-1 font-medium">{new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.registration_opens_at))}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Registration fee</dt>
              <dd className="mt-1 font-medium">{Number(event.price) === 0 ? 'Free' : `₹${Number(event.price).toFixed(2)}`}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Available places</dt>
              <dd className="mt-1 font-medium">{event.capacity ?? 'No capacity limit'}</dd>
            </div>
            {event.registration_deadline && (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Register by</dt>
                <dd className="mt-1 font-medium">{new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.registration_deadline))}</dd>
              </div>
            )}
          </dl>
        </section>
        <EventRegistration
          eventId={event.id}
          eventTitle={event.title}
          price={Number(event.price)}
          registration={registration}
          hasPendingPayment={hasPendingPayment}
          authenticated={Boolean(authData.user)}
          upiId={paymentSettings?.upi_id ?? null}
          paymentInstructions={paymentSettings?.payment_instructions ?? ''}
          paymentSettingsError={paymentSettingsError ? 'The payment settings migration has not been applied or settings could not be loaded.' : null}
        />
      </div>
    </>
  )
}
