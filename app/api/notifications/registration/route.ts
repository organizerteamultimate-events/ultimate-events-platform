import { NextResponse, type NextRequest } from 'next/server'
import { escapeEmailHtml, sendTransactionalEmail } from '@/lib/email'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 })

  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) {
    return NextResponse.json({ error: 'Sign in to request a registration email.' }, { status: 401 })
  }

  let body: { registrationId?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 })
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      typeof body.registrationId !== 'string' || !uuidPattern.test(body.registrationId)) {
    return NextResponse.json({ error: 'A valid registration ID is required.' }, { status: 400 })
  }

  const { data: registration, error: registrationError } = await supabase
    .from('registrations')
    .select('id, user_id, event_id, status, payment_status')
    .eq('id', body.registrationId)
    .eq('user_id', authData.user.id)
    .maybeSingle()
  if (registrationError) {
    return NextResponse.json({ error: `Registration could not be loaded: ${registrationError.message}` }, { status: 500 })
  }
  if (!registration) return NextResponse.json({ error: 'Registration not found.' }, { status: 404 })

  const [{ data: profile, error: profileError }, { data: event, error: eventError }] = await Promise.all([
    supabase.from('profiles').select('email, full_name').eq('id', authData.user.id).maybeSingle(),
    supabase.from('events').select('title').eq('id', registration.event_id).maybeSingle(),
  ])
  if (profileError || eventError) {
    return NextResponse.json({ error: 'Registration email details could not be loaded.' }, { status: 500 })
  }
  if (!profile?.email || !event?.title) {
    return NextResponse.json({ error: 'A verified profile email or event title is unavailable.' }, { status: 409 })
  }

  const isConfirmed = registration.status === 'confirmed'
  const subject = isConfirmed ? `Registration confirmed: ${event.title}` : `Registration received: ${event.title}`
  const statusText = isConfirmed
    ? 'Your place is confirmed.'
    : 'Your registration is pending payment verification. It is not confirmed until an administrator verifies your UPI transfer.'
  const name = profile.full_name || 'Participant'
  const safeName = escapeEmailHtml(name)
  const safeTitle = escapeEmailHtml(event.title)
  const safeStatus = escapeEmailHtml(statusText)

  try {
    await sendTransactionalEmail({
      to: profile.email,
      subject,
      text: `Hello ${name},\n\n${statusText}\nEvent: ${event.title}\nRegistration ID: ${registration.id}\n\nULTIMATE EVENTS`,
      html: `<p>Hello ${safeName},</p><p>${safeStatus}</p><p><strong>Event:</strong> ${safeTitle}<br><strong>Registration ID:</strong> ${registration.id}</p><p>ULTIMATE EVENTS</p>`,
    })
    return NextResponse.json({ sent: true })
  } catch (error) {
    console.error('Registration notification delivery failed', error)
    const message = error instanceof Error && error.message.includes('not configured')
      ? error.message
      : 'Email could not be delivered. Verify the server-side SMTP settings.'
    return NextResponse.json({ error: message }, { status: 503 })
  }
}
