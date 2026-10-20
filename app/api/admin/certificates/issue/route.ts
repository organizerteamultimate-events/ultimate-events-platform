import { NextResponse, type NextRequest } from 'next/server'
import { escapeEmailHtml, sendTransactionalEmail } from '@/lib/email'
import { buildAbsoluteUrl } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
type IssuedCertificate = {
  id: string
  user_id: string
  recipient_name: string
  event_name: string
  certificate_number: string
  verification_code: string
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 })
  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError || !auth.user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  const { data: administrator, error: roleError } = await supabase
    .from('profiles')
    .select('role, account_status')
    .eq('id', auth.user.id)
    .maybeSingle()
  if (roleError) return NextResponse.json({ error: 'Administrator authorization could not be verified.' }, { status: 500 })
  if (administrator?.role !== 'admin' || administrator.account_status !== 'active') {
    return NextResponse.json({ error: 'Active administrator access required.' }, { status: 403 })
  }

  let body: { eventId?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 })
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || typeof body.eventId !== 'string' || !uuidPattern.test(body.eventId)) {
    return NextResponse.json({ error: 'A valid event ID is required.' }, { status: 400 })
  }

  const { data: issued, error: issueError } = await supabase.rpc('issue_event_certificates', {
    p_event_id: body.eventId,
  })
  if (issueError) return NextResponse.json({ error: issueError.message }, { status: 409 })
  const certificates = (issued ?? []) as IssuedCertificate[]
  if (!certificates.length) return NextResponse.json({ issued: 0, emailsAccepted: 0 })

  const userIds = [...new Set(certificates.map((certificate) => certificate.user_id))]
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, email')
    .in('id', userIds)
  if (profileError) {
    console.error('Certificate recipients could not be loaded', profileError)
    return NextResponse.json({
      issued: certificates.length,
      emailsAccepted: 0,
      emailError: 'Certificates were issued, but recipient email addresses could not be loaded.',
    })
  }
  const emailsByUser = new Map((profiles ?? []).map((profile) => [profile.id, profile.email]))
  const delivery = await Promise.allSettled(certificates.map(async (certificate) => {
    const email = emailsByUser.get(certificate.user_id)
    if (!email) throw new Error('Recipient email is unavailable.')
    const verificationUrl = buildAbsoluteUrl('/verify-certificate', {
      certificate: certificate.certificate_number,
    })
    const downloadUrl = buildAbsoluteUrl('/login', { next: '/dashboard/certificates' })
    const name = escapeEmailHtml(certificate.recipient_name)
    const eventName = escapeEmailHtml(certificate.event_name)
    await sendTransactionalEmail({
      to: email,
      subject: `Certificate issued: ${certificate.event_name}`,
      text: `Hello ${certificate.recipient_name},\n\nYour certificate for ${certificate.event_name} is ready.\nCertificate number: ${certificate.certificate_number}\nDownload: ${downloadUrl}\nVerify: ${verificationUrl}\n\nULTIMATE EVENTS`,
      html: `<p>Hello ${name},</p><p>Your certificate for <strong>${eventName}</strong> is ready.</p><p>Certificate number: <strong>${certificate.certificate_number}</strong></p><p><a href="${downloadUrl}">Download certificate</a> · <a href="${verificationUrl}">Verify certificate</a></p><p>ULTIMATE EVENTS</p>`,
    })
  }))
  const emailsAccepted = delivery.filter((result) => result.status === 'fulfilled').length
  const emailError = emailsAccepted === certificates.length
    ? null
    : 'Some or all notices were not accepted by SMTP. Check the server-side settings and retry notices manually.'
  if (emailError) console.error('Some certificate notification emails were not accepted by SMTP', delivery.filter((result) => result.status === 'rejected'))

  return NextResponse.json({ issued: certificates.length, emailsAccepted, emailError })
}
