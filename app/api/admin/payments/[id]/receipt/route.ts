import { NextResponse, type NextRequest } from 'next/server'
import { isActiveAccountStatus } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!uuidPattern.test(id)) {
    return NextResponse.json({ error: 'A valid payment ID is required.' }, { status: 400 })
  }

  const supabase = await createSupabaseServerClient()
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 })

  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) {
    return NextResponse.json({ error: 'Administrator authentication is required.' }, { status: 401 })
  }
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, account_status')
    .eq('id', authData.user.id)
    .maybeSingle()
  if (profileError) {
    return NextResponse.json({ error: 'Administrator access could not be verified.' }, { status: 500 })
  }
  if (profile?.role !== 'admin' || !isActiveAccountStatus(profile.account_status)) {
    return NextResponse.json({ error: 'Active administrator access is required.' }, { status: 403 })
  }

  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .select('receipt_path')
    .eq('id', id)
    .maybeSingle()
  if (paymentError) {
    return NextResponse.json({ error: 'Payment receipt could not be loaded.' }, { status: 500 })
  }
  if (!payment?.receipt_path) {
    return NextResponse.json({ error: 'No receipt is attached to this payment.' }, { status: 404 })
  }

  const { data: signedUrl, error: signedUrlError } = await supabase.storage
    .from('ultimate-event-payment-receipts')
    .createSignedUrl(payment.receipt_path, 60)
  if (signedUrlError || !signedUrl?.signedUrl) {
    return NextResponse.json({ error: 'A secure receipt link could not be created.' }, { status: 500 })
  }
  return NextResponse.redirect(signedUrl.signedUrl, {
    headers: {
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer',
    },
  })
}
