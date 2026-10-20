import { NextResponse, type NextRequest } from 'next/server'
import { escapeEmailHtml, sendTransactionalEmail } from '@/lib/email'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const actions = new Set(['suspend', 'reactivate', 'delete'])

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

  let body: { userId?: unknown; action?: unknown; reason?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 })
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || typeof body.userId !== 'string' || !uuidPattern.test(body.userId)
    || typeof body.action !== 'string' || !actions.has(body.action)
    || (body.reason !== undefined && typeof body.reason !== 'string')) {
    return NextResponse.json({ error: 'A valid participant ID, action, and optional reason are required.' }, { status: 400 })
  }
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (reason.length > 500) return NextResponse.json({ error: 'The reason must be 500 characters or fewer.' }, { status: 400 })

  const { data: participant, error: participantError } = await supabase
    .from('profiles')
    .select('email, full_name')
    .eq('id', body.userId)
    .maybeSingle()
  if (participantError) return NextResponse.json({ error: 'Participant details could not be loaded.' }, { status: 500 })
  if (!participant) return NextResponse.json({ error: 'Participant not found.' }, { status: 404 })

  const { error: actionError } = await supabase.rpc('manage_participant', {
    p_user_id: body.userId,
    p_action: body.action,
    p_reason: reason,
  })
  if (actionError) return NextResponse.json({ error: actionError.message }, { status: 409 })

  const actionLabel = body.action === 'reactivate' ? 'restored' : body.action === 'delete' ? 'deleted' : 'suspended'
  const name = participant.full_name || 'Participant'
  const detail = reason ? `\n\nReason: ${reason}` : ''
  try {
    await sendTransactionalEmail({
      to: participant.email,
      subject: `Your ULTIMATE EVENTS account was ${actionLabel}`,
      text: `Hello ${name},\n\nYour account was ${actionLabel} by an administrator.${detail}\n\nContact support if you believe this is incorrect.`,
      html: `<p>Hello ${escapeEmailHtml(name)},</p><p>Your account was ${actionLabel} by an administrator.</p>${reason ? `<p><strong>Reason:</strong> ${escapeEmailHtml(reason)}</p>` : ''}<p>Contact support if you believe this is incorrect.</p>`,
    })
    return NextResponse.json({ updated: true, emailAccepted: true })
  } catch (error) {
    console.error('Participant status notification delivery failed', error)
    const message = error instanceof Error && error.message.includes('not configured')
      ? error.message
      : 'The account changed, but SMTP did not accept the email. Check the server-side SMTP settings.'
    return NextResponse.json({ updated: true, emailAccepted: false, error: message })
  }
}
