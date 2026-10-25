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
    .select('upi_id, account_holder_name, qr_image_path, payment_instructions')
    .eq('id', true)
    .maybeSingle()
  let registration: { id: string; status: string; payment_status: string; amount: number } | null = null
  let payment: { status: string; rejection_reason: string | null } | null = null
  let registrationError: string | null = null
  if (authData.user) {
    const { data: existing, error: existingError } = await supabase
      .from('registrations')
      .select('id, status, payment_status, amount')
      .eq('event_id', id)
      .eq('user_id', authData.user.id)
      .maybeSingle()
    registration = existing
    if (existingError) registrationError = existingError.message
    if (existing && !existingError) {
      const { data: existingPayment, error: existingPaymentError } = await supabase
        .from('payments')
        .select('status, rejection_reason')
        .eq('registration_id', existing.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (existingPaymentError) registrationError = existingPaymentError.message
      else payment = existingPayment
    }
  }
  const qrImageUrl = paymentSettings?.qr_image_path
    ? supabase.storage.from('ultimate-event-payment-qr').getPublicUrl(paymentSettings.qr_image_path).data.publicUrl
    : null

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
          payment={payment}
          authenticated={Boolean(authData.user)}
          upiId={paymentSettings?.upi_id ?? null}
          accountHolderName={paymentSettings?.account_holder_name ?? null}
          qrImageUrl={qrImageUrl}
          paymentInstructions={paymentSettings?.payment_instructions ?? ''}
          paymentSettingsError={paymentSettingsError
            ? 'Payment settings could not be loaded. The organizer should check the Supabase payment workflow migration.'
            : registrationError
              ? 'Your existing registration or payment status could not be loaded. Reload the page or contact support.'
              : null}
        />
      </div>
    </>
  )
}
