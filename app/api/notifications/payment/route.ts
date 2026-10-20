import { NextResponse, type NextRequest } from 'next/server'
import { escapeEmailHtml, sendTransactionalEmail } from '@/lib/email'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 })

  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) {
    return NextResponse.json({ error: 'Sign in as an administrator to send payment status emails.' }, { status: 401 })
  }
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, account_status')
    .eq('id', authData.user.id)
    .maybeSingle()
  if (profileError) return NextResponse.json({ error: 'Administrator role could not be verified.' }, { status: 500 })
  if (profile?.role !== 'admin' || profile.account_status !== 'active') {
    return NextResponse.json({ error: 'Active administrator access required.' }, { status: 403 })
  }

  let body: { paymentId?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 })
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      typeof body.paymentId !== 'string' || !uuidPattern.test(body.paymentId)) {
    return NextResponse.json({ error: 'A valid payment ID is required.' }, { status: 400 })
  }

  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .select('id, registration_id, amount, status, rejection_reason')
    .eq('id', body.paymentId)
    .maybeSingle()
  if (paymentError) return NextResponse.json({ error: 'Payment record could not be loaded.' }, { status: 500 })
  if (!payment || !['verified', 'rejected'].includes(payment.status ?? '')) {
    return NextResponse.json({ error: 'A reviewed payment is required before sending a status notice.' }, { status: 409 })
  }

  const { data: registration, error: registrationError } = await supabase
    .from('registrations')
    .select('user_id, event_id')
    .eq('id', payment.registration_id)
    .maybeSingle()
  if (registrationError || !registration) {
    return NextResponse.json({ error: 'Payment registration could not be loaded.' }, { status: 500 })
  }
  const [{ data: participant, error: participantError }, { data: event, error: eventError }] = await Promise.all([
    supabase.from('profiles').select('email, full_name, account_status').eq('id', registration.user_id).maybeSingle(),
    supabase.from('events').select('title').eq('id', registration.event_id).maybeSingle(),
  ])
  if (participantError || eventError) {
    return NextResponse.json({ error: 'Payment notification details could not be loaded.' }, { status: 500 })
  }
  if (!participant?.email || participant.account_status === 'deleted' || !event?.title) {
    return NextResponse.json({ error: 'Participant email or event title is unavailable.' }, { status: 409 })
  }

  const name = participant.full_name || 'Participant'
  const safeName = escapeEmailHtml(name)
  const safeTitle = escapeEmailHtml(event.title)
  const amount = Number(payment.amount).toFixed(2)
  const rejected = payment.status === 'rejected'
  const rejectionReason = payment.rejection_reason?.trim()
  if (rejected && !rejectionReason) {
    return NextResponse.json({ error: 'The reviewed payment has no recorded rejection reason.' }, { status: 409 })
  }
  const safeReason = rejectionReason ? escapeEmailHtml(rejectionReason) : ''
  try {
    await sendTransactionalEmail({
      to: participant.email,
      subject: rejected ? `Payment needs correction: ${event.title}` : `Payment verified: ${event.title}`,
      text: rejected
        ? `Hello ${name},\n\nYour payment reference for ${event.title} was not accepted. Reason: ${rejectionReason}\nPlease submit a corrected transaction reference.\nPayment ID: ${payment.id}\n\nULTIMATE EVENTS`
        : `Hello ${name},\n\nYour payment of INR ${amount} for ${event.title} has been verified. Your event registration is confirmed.\nPayment ID: ${payment.id}\n\nULTIMATE EVENTS`,
      html: rejected
        ? `<p>Hello ${safeName},</p><p>Your payment reference for <strong>${safeTitle}</strong> was not accepted.</p><p><strong>Reason:</strong> ${safeReason}</p><p>Please submit a corrected transaction reference.</p><p><strong>Payment ID:</strong> ${payment.id}</p><p>ULTIMATE EVENTS</p>`
        : `<p>Hello ${safeName},</p><p>Your payment of <strong>INR ${amount}</strong> for <strong>${safeTitle}</strong> has been verified. Your event registration is confirmed.</p><p><strong>Payment ID:</strong> ${payment.id}</p><p>ULTIMATE EVENTS</p>`,
    })
    return NextResponse.json({ accepted: true, status: 'accepted' })
  } catch (error) {
    console.error('Payment status email submission failed', error)
    const message = error instanceof Error && error.message.includes('not configured')
      ? error.message
      : 'Email was not accepted by SMTP. Verify the server-side SMTP settings.'
    return NextResponse.json({ error: message }, { status: 503 })
  }
}
