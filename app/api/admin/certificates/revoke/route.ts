import { NextResponse, type NextRequest } from 'next/server'
import { escapeEmailHtml, sendTransactionalEmail } from '@/lib/email'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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

  let body: { certificateId?: unknown; reason?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 })
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || typeof body.certificateId !== 'string' || !uuidPattern.test(body.certificateId)
    || typeof body.reason !== 'string' || body.reason.trim().length < 3 || body.reason.length > 500) {
    return NextResponse.json({ error: 'A valid certificate ID and revocation reason are required.' }, { status: 400 })
  }

  const { data: certificate, error: certificateError } = await supabase
    .from('certificates')
    .select('certificate_number, recipient_name, user_id')
    .eq('id', body.certificateId)
    .is('revoked_at', null)
    .maybeSingle()
  if (certificateError) return NextResponse.json({ error: 'Certificate details could not be loaded.' }, { status: 500 })
  if (!certificate) return NextResponse.json({ error: 'Active certificate not found.' }, { status: 404 })

  const { error: revokeError } = await supabase.rpc('revoke_certificate', {
    p_certificate_id: body.certificateId,
    p_reason: body.reason.trim(),
  })
  if (revokeError) return NextResponse.json({ error: revokeError.message }, { status: 409 })
  const { data: participant, error: participantError } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', certificate.user_id)
    .maybeSingle()
  if (participantError || !participant?.email) {
    return NextResponse.json({ revoked: true, emailAccepted: false, error: 'Certificate revoked, but the participant email is unavailable.' })
  }

  try {
    await sendTransactionalEmail({
      to: participant.email,
      subject: `Certificate revoked: ${certificate.certificate_number}`,
      text: `Hello ${certificate.recipient_name},\n\nCertificate ${certificate.certificate_number} was revoked by an administrator.\nReason: ${body.reason.trim()}\n\nContact support if you believe this is incorrect.`,
      html: `<p>Hello ${escapeEmailHtml(certificate.recipient_name)},</p><p>Certificate <strong>${certificate.certificate_number}</strong> was revoked by an administrator.</p><p><strong>Reason:</strong> ${escapeEmailHtml(body.reason.trim())}</p><p>Contact support if you believe this is incorrect.</p>`,
    })
    return NextResponse.json({ revoked: true, emailAccepted: true })
  } catch (error) {
    console.error('Certificate revocation email delivery failed', error)
    return NextResponse.json({
      revoked: true,
      emailAccepted: false,
      error: 'Certificate revoked, but SMTP did not accept the email. Check server-side settings.',
    })
  }
}
