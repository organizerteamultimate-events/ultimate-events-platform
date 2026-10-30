'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { FormResult, SubmitButton, inputClass } from '@/components/forms/field'

type Registration = {
  id: string
  status: string
  payment_status: string
  amount: number
}

type Payment = {
  status: string
  rejection_reason: string | null
}

export function EventRegistration({
  eventId,
  eventTitle,
  price,
  registration,
  payment,
  authenticated,
  upiId,
  accountHolderName,
  qrImageUrl,
  paymentInstructions,
  paymentSettingsError,
}: {
  eventId: string
  eventTitle: string
  price: number
  registration: Registration | null
  payment: Payment | null
  authenticated: boolean
  upiId: string | null
  accountHolderName: string | null
  qrImageUrl: string | null
  paymentInstructions: string
  paymentSettingsError: string | null
}) {
  const router = useRouter()
  const [currentRegistration, setCurrentRegistration] = useState(registration)
  const [currentPayment, setCurrentPayment] = useState(payment)
  const [utr, setUtr] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setCurrentRegistration(registration)
    setCurrentPayment(payment)
  }, [registration, payment])

  async function register() {
    setMessage(null)
    if (price > 0 && (!upiId || paymentSettingsError)) {
      setMessage('Paid-event registration is temporarily unavailable. The organizer must configure payment details in the admin panel.')
      return
    }
    const supabase = createSupabaseBrowserClient()
    if (!supabase) {
      setMessage('Registration is unavailable because Supabase is not configured.')
      return
    }

    setPending(true)
    try {
      const { data, error } = await supabase.rpc('register_for_event', { p_event_id: eventId })
      if (error) {
        setMessage(`Registration failed: ${error.message}`)
        return
      }
      if (!data) {
        setMessage('Registration failed: the service returned no registration ID.')
        return
      }
      const { data: savedRegistration, error: savedRegistrationError } = await supabase
        .from('registrations')
        .select('id, status, payment_status, amount')
        .eq('id', data)
        .maybeSingle()
      if (savedRegistrationError || !savedRegistration) {
        setMessage('Registration was recorded, but its status could not be verified. Reload this page or contact support.')
        router.refresh()
        return
      }
      setCurrentRegistration(savedRegistration)
      const registrationConfirmed = Number(savedRegistration.amount) === 0
        || savedRegistration.payment_status === 'verified'
      const registrationMessage = registrationConfirmed
        ? 'You are registered. Your place is confirmed.'
        : 'Registration saved. Complete the UPI payment below; your place is pending until an administrator verifies it.'
      router.refresh()
      setMessage(registrationMessage)
      try {
        const response = await fetch('/api/notifications/registration', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ registrationId: savedRegistration.id }),
        })
        if (!response.ok) {
          const result = await response.json() as { error?: string }
          setMessage(`${registrationMessage} SMTP did not accept the email: ${result.error ?? 'email service unavailable'}`)
        }
      } catch {
        setMessage(`${registrationMessage} Email acceptance could not be confirmed; your registration is saved.`)
      }
    } catch (error) {
      setMessage(`Registration failed: ${error instanceof Error ? error.message : 'Unexpected connection error.'}`)
    } finally {
      setPending(false)
    }
  }

  async function submitPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)
    if (!currentRegistration) {
      setMessage('Sign in and register for this event before submitting payment details.')
      return
    }
    if (currentRegistration.amount <= 0) {
      setMessage('Free registrations do not require a payment submission.')
      return
    }

    const form = event.currentTarget
    const receiptInput = form.elements.namedItem('receipt')
    const receipt = receiptInput instanceof HTMLInputElement ? receiptInput.files?.[0] : null
    if (!receipt || !['image/png', 'image/jpeg', 'image/webp'].includes(receipt.type) || receipt.size < 1 || receipt.size > 5 * 1024 * 1024) {
      setMessage('Choose a PNG, JPEG, or WebP receipt image no larger than 5 MB.')
      return
    }
    if (utr.trim().length < 6 || utr.trim().length > 100) {
      setMessage('Enter a transaction reference between 6 and 100 characters.')
      return
    }

    setPending(true)
    try {
      const body = new FormData()
      body.set('registrationId', currentRegistration.id)
      body.set('utr', utr.trim())
      body.set('receipt', receipt)
      const response = await fetch('/api/payments/submit', { method: 'POST', body })
      const result = await response.json() as { error?: string; status?: string }
      if (!response.ok) {
        setMessage(`Payment was not submitted: ${result.error ?? 'Unexpected server response.'}`)
        return
      }
      setCurrentPayment({ status: result.status ?? 'pending', rejection_reason: null })
      setCurrentRegistration({ ...currentRegistration, status: 'pending', payment_status: 'pending' })
      setMessage('Receipt and transaction reference submitted. Your registration remains pending until an administrator verifies the payment.')
      form.reset()
      setUtr('')
    } catch (error) {
      setMessage(`Payment was not submitted: ${error instanceof Error ? error.message : 'Unexpected connection error.'}`)
    } finally {
      setPending(false)
    }
  }

  const paymentAmount = currentRegistration?.amount ?? price
  const upiLink = upiId
    ? `upi://pay?${new URLSearchParams({
        pa: upiId,
        pn: accountHolderName ?? 'ULTIMATE EVENTS',
        am: Number(paymentAmount).toFixed(2),
        cu: 'INR',
        tn: eventTitle,
      }).toString()}`
    : null

  if (!authenticated) {
    return (
      <div className="rounded-2xl border bg-card p-6">
        <p className="text-sm leading-relaxed text-muted-foreground">Sign in to register and track your event activity.</p>
        <Link href={`/login?next=/events/${eventId}`} className="mt-4 inline-flex h-10 items-center rounded-lg bg-gold px-4 text-sm font-semibold text-gold-foreground hover:bg-gold/90">
          Sign in to register
        </Link>
      </div>
    )
  }

  return (
    <section aria-labelledby="registration-heading" className="rounded-2xl border bg-card p-6 shadow-sm">
      <h2 id="registration-heading" className="text-xl font-bold">Registration</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {paymentAmount === 0 ? 'This event is free.' : `Registration fee: ₹${Number(paymentAmount).toFixed(2)}.`}
      </p>

      {!currentRegistration ? (
        <button
          type="button"
          disabled={pending}
          onClick={register}
          className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-lg bg-gold px-5 text-sm font-semibold text-gold-foreground transition-colors hover:bg-gold/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? 'Registering…' : 'Register for event'}
        </button>
      ) : (
        <div className="mt-5 rounded-xl bg-muted/60 p-4 text-sm">
          <p><span className="font-semibold">Registration ID:</span> <span className="break-all font-mono">{currentRegistration.id}</span></p>
          <p className="mt-2"><span className="font-semibold">Status:</span> {currentRegistration.status}</p>
          <p className="mt-1"><span className="font-semibold">Payment:</span> {currentPayment?.status === 'pending'
            ? 'Pending Verification'
            : currentPayment?.status === 'verified'
              ? 'Verified'
              : currentPayment?.status === 'rejected'
                ? 'Rejected'
                : currentRegistration.payment_status.replace('_', ' ')}</p>
        </div>
      )}

      {currentRegistration && paymentAmount > 0 && currentPayment?.status !== 'verified' && (
        <div className="mt-5 border-t pt-5">
          <h3 className="font-semibold">Manual UPI payment</h3>
          {upiId && !paymentSettingsError ? (
            <div className="mt-3 space-y-3 text-sm">
              <p>Pay exactly <strong>₹{Number(paymentAmount).toFixed(2)}</strong> to <strong>{upiId}</strong>.</p>
              {accountHolderName && <p>Account holder: <strong>{accountHolderName}</strong></p>}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(upiId)
                      setCopied(true)
                    } catch {
                      setMessage('Could not copy the UPI ID. Select and copy it manually.')
                    }
                  }}
                  className="rounded-lg border px-3 py-2 font-semibold"
                >
                  {copied ? 'UPI ID copied' : 'Copy UPI ID'}
                </button>
                {upiLink && <a href={upiLink} className="rounded-lg border px-3 py-2 font-semibold">Open a UPI app</a>}
              </div>
              {qrImageUrl && <img src={qrImageUrl} alt="Organizer UPI payment QR code" className="size-52 rounded-lg border object-contain" />}
            </div>
          ) : (
            <p role="status" className="mt-2 text-sm text-muted-foreground">
              Online UPI details are not configured yet. Contact the organizer before making a payment.
            </p>
          )}
          {paymentInstructions && <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{paymentInstructions}</p>}
          {paymentSettingsError && <p role="alert" className="mt-3 text-sm text-destructive">{paymentSettingsError}</p>}

          {currentPayment?.status === 'pending' ? (
            <p className="mt-4 rounded-lg border border-gold/40 bg-accent px-4 py-3 text-sm">
              Pending Verification — receipt and transaction reference are awaiting administrator review. Your event place is not confirmed yet.
            </p>
          ) : (
            <>
              {currentPayment?.status === 'rejected' && (
                <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
                  Payment Rejected{currentPayment.rejection_reason ? `: ${currentPayment.rejection_reason}` : '.'} Submit a corrected reference and receipt.
                </p>
              )}
              <form onSubmit={submitPayment} className="mt-4 flex flex-col gap-3">
                <label htmlFor="upi-utr" className="text-sm font-medium">UPI transaction reference / UTR</label>
                <input id="upi-utr" name="utr" value={utr} onChange={(e) => setUtr(e.target.value)} className={inputClass} minLength={6} maxLength={100} required autoComplete="off" />
                <label htmlFor="upi-receipt" className="text-sm font-medium">Payment receipt image</label>
                <input id="upi-receipt" name="receipt" type="file" accept="image/png,image/jpeg,image/webp" className={inputClass} required />
                <p className="text-xs text-muted-foreground">PNG, JPEG, or WebP, up to 5 MB. Stored privately and visible only to you and authorized admins.</p>
                <SubmitButton pending={pending}>{pending ? 'Submitting…' : 'Submit for verification'}</SubmitButton>
              </form>
            </>
          )}
        </div>
      )}
      <FormResult message={message} />
    </section>
  )
}
