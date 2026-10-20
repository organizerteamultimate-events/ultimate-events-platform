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

  let body: { submissionId?: unknown; winnerId?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 })
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'A submission or winner ID is required.' }, { status: 400 })
  }

  if (typeof body.submissionId === 'string' && uuidPattern.test(body.submissionId)) {
    const { data: submission, error } = await supabase
      .from('submissions')
      .select('user_id, event_id, status, feedback')
      .eq('id', body.submissionId)
      .in('status', ['accepted', 'rejected'])
      .maybeSingle()
    if (error) return NextResponse.json({ error: 'Submission details could not be loaded.' }, { status: 500 })
    if (!submission) return NextResponse.json({ error: 'Reviewed submission not found.' }, { status: 404 })
    const [{ data: participant, error: participantError }, { data: event, error: eventError }] = await Promise.all([
      supabase.from('profiles').select('email, full_name').eq('id', submission.user_id).maybeSingle(),
      supabase.from('events').select('title').eq('id', submission.event_id).maybeSingle(),
    ])
    if (participantError || eventError) return NextResponse.json({ error: 'Notification details could not be loaded.' }, { status: 500 })
    if (!participant?.email || !event?.title) return NextResponse.json({ error: 'Participant email or event title is unavailable.' }, { status: 409 })
    const name = participant.full_name || 'Participant'
    const title = event.title
    const decision = submission.status
    const feedback = submission.feedback
    try {
      await sendTransactionalEmail({
        to: participant.email,
        subject: `Competition submission ${decision}: ${title}`,
        text: `Hello ${name},\n\nYour submission for ${title} has been ${decision}.${feedback ? `\n\nFeedback: ${feedback}` : ''}\n\nULTIMATE EVENTS`,
        html: `<p>Hello ${escapeEmailHtml(name)},</p><p>Your submission for <strong>${escapeEmailHtml(title)}</strong> has been ${decision}.</p>${feedback ? `<p><strong>Feedback:</strong> ${escapeEmailHtml(feedback)}</p>` : ''}<p>ULTIMATE EVENTS</p>`,
      })
      return NextResponse.json({ accepted: true, status: 'accepted' })
    } catch (sendError) {
      console.error('Submission result email delivery failed', sendError)
      return NextResponse.json({ error: 'The result was saved, but SMTP did not accept the email. Check server-side SMTP settings.' }, { status: 503 })
    }
  }

  if (typeof body.winnerId === 'string' && uuidPattern.test(body.winnerId)) {
    const { data: winner, error } = await supabase
      .from('winners')
      .select('user_id, event_id, place, award_title')
      .eq('id', body.winnerId)
      .eq('published', true)
      .maybeSingle()
    if (error) return NextResponse.json({ error: 'Published result could not be loaded.' }, { status: 500 })
    if (!winner) return NextResponse.json({ error: 'Published result not found.' }, { status: 404 })
    const [{ data: participant, error: participantError }, { data: event, error: eventError }] = await Promise.all([
      supabase.from('profiles').select('email, full_name').eq('id', winner.user_id).maybeSingle(),
      supabase.from('events').select('title').eq('id', winner.event_id).maybeSingle(),
    ])
    if (participantError || eventError) return NextResponse.json({ error: 'Winner notification details could not be loaded.' }, { status: 500 })
    if (!participant?.email || !event?.title) return NextResponse.json({ error: 'Participant email or event title is unavailable.' }, { status: 409 })
    const name = participant.full_name || 'Participant'
    try {
      await sendTransactionalEmail({
        to: participant.email,
        subject: `Official result published: ${event.title}`,
        text: `Hello ${name},\n\nYou have been awarded ${winner.award_title} (place ${winner.place}) for ${event.title}.\n\nULTIMATE EVENTS`,
        html: `<p>Hello ${escapeEmailHtml(name)},</p><p>Your official result for <strong>${escapeEmailHtml(event.title)}</strong> has been published.</p><p><strong>${escapeEmailHtml(winner.award_title)}</strong> · Place ${winner.place}</p><p>ULTIMATE EVENTS</p>`,
      })
      return NextResponse.json({ accepted: true, status: 'accepted' })
    } catch (sendError) {
      console.error('Winner result email delivery failed', sendError)
      return NextResponse.json({ error: 'The result was saved, but SMTP did not accept the email. Check server-side SMTP settings.' }, { status: 503 })
    }
  }

  return NextResponse.json({ error: 'A valid reviewed submission or published winner ID is required.' }, { status: 400 })
}
