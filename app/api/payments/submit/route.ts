import { randomUUID } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { isActiveAccountStatus } from '@/lib/auth'
import { isValidPaymentImage, maxPaymentReceiptBytes } from '@/lib/payment-receipts'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const receiptBucket = 'ultimate-event-payment-receipts'

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 })
  const adminSupabase = createSupabaseAdminClient()
  if (!adminSupabase) return NextResponse.json({ error: 'Secure receipt submission is not configured on the server.' }, { status: 503 })

  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) {
    return NextResponse.json({ error: 'Sign in before submitting payment details.' }, { status: 401 })
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('account_status')
    .eq('id', authData.user.id)
    .maybeSingle()
  if (profileError) {
    return NextResponse.json({ error: `Account status could not be verified: ${profileError.message}` }, { status: 500 })
  }
  if (!isActiveAccountStatus(profile?.account_status)) {
    return NextResponse.json({ error: 'An active participant account is required.' }, { status: 403 })
  }

  const contentLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > maxPaymentReceiptBytes + 64 * 1024) {
    return NextResponse.json({ error: 'Receipt image must be no larger than 5 MB.' }, { status: 413 })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Payment submission must be multipart form data.' }, { status: 400 })
  }
  const registrationId = form.get('registrationId')
  const utrValue = form.get('utr')
  const receipt = form.get('receipt')
  if (
    typeof registrationId !== 'string' ||
    !uuidPattern.test(registrationId) ||
    typeof utrValue !== 'string' ||
    utrValue.trim().length < 6 ||
    utrValue.trim().length > 100 ||
    !(receipt instanceof File)
  ) {
    return NextResponse.json({ error: 'A valid registration, transaction reference, and receipt image are required.' }, { status: 400 })
  }
  if (receipt.size < 1 || receipt.size > maxPaymentReceiptBytes) {
    return NextResponse.json({ error: 'Receipt image must be larger than 0 bytes and no larger than 5 MB.' }, { status: 413 })
  }

  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await receipt.arrayBuffer())
  } catch (error) {
    console.error('Could not read submitted payment receipt', error)
    return NextResponse.json({ error: 'Receipt image could not be read. Choose the file again and retry.' }, { status: 400 })
  }
  if (!isValidPaymentImage(bytes, receipt.type, maxPaymentReceiptBytes)) {
    return NextResponse.json({ error: 'Receipt must be a valid PNG, JPEG, or WebP image.' }, { status: 400 })
  }

  const { data: registration, error: registrationError } = await supabase
    .from('registrations')
    .select('id, amount, status')
    .eq('id', registrationId)
    .eq('user_id', authData.user.id)
    .maybeSingle()
  if (registrationError) {
    return NextResponse.json({ error: `Registration could not be verified: ${registrationError.message}` }, { status: 500 })
  }
  if (!registration || Number(registration.amount) <= 0 || registration.status === 'cancelled') {
    return NextResponse.json({ error: 'A valid paid registration is required to submit payment.' }, { status: 404 })
  }

  const extension = receipt.type === 'image/jpeg' ? 'jpg' : receipt.type.slice('image/'.length)
  const receiptPath = `${authData.user.id}/${registrationId}/${randomUUID()}.${extension}`
  let uploaded = false
  let paymentRpcStarted = false
  try {
    const { error: uploadError } = await adminSupabase.storage.from(receiptBucket).upload(receiptPath, bytes, {
      contentType: receipt.type,
      upsert: false,
    })
    if (uploadError) {
      return NextResponse.json({ error: `Receipt could not be stored securely: ${uploadError.message}` }, { status: 500 })
    }
    uploaded = true

    paymentRpcStarted = true
    const { data: paymentId, error: paymentError } = await adminSupabase.rpc('submit_upi_payment_for_user', {
      p_user_id: authData.user.id,
      p_registration_id: registrationId,
      p_utr: utrValue.trim(),
      p_receipt_path: receiptPath,
    })
    if (paymentError || !paymentId) {
      if (paymentError) {
        console.error('Payment submission returned an error; preserving receipt until the payment link is verified', {
          registrationId,
          userId: authData.user.id,
        })
        return NextResponse.json(
          { error: 'Payment submission could not be confirmed. Reload your payment history before retrying; your receipt was retained securely.' },
          { status: paymentError.message.toLowerCase().includes('already') ? 409 : 500 },
        )
      }
      return NextResponse.json(
        { error: 'Payment submission could not be confirmed. Reload your payment history before retrying; your receipt was retained securely.' },
        { status: 500 },
      )
    }
    return NextResponse.json({ paymentId, status: 'pending' }, { status: 201 })
  } catch (error) {
    if (uploaded && paymentRpcStarted) {
      console.error('Payment submission result is uncertain; preserving the uploaded private receipt', {
        registrationId,
        userId: authData.user.id,
      })
    } else if (uploaded) {
      await removeUnlinkedReceipt(adminSupabase, receiptPath)
    }
    console.error('Payment submission RPC failed', error)
    return NextResponse.json({ error: 'Payment submission could not be confirmed. Please retry or contact support.' }, { status: 500 })
  }
}

async function removeUnlinkedReceipt(
  supabase: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  receiptPath: string,
) {
  try {
    const { error } = await supabase.storage.from(receiptBucket).remove([receiptPath])
    if (error) console.error('Could not remove an unlinked payment receipt', error)
  } catch (error) {
    console.error('Could not remove an unlinked payment receipt', error)
  }
}
