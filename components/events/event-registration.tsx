'use client'

import Link from 'next/link'
import { useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { FormResult, SubmitButton, inputClass } from '@/components/forms/field'

type Registration = {
  id: string
  status: string
  payment_status: string
}

export function EventRegistration({
  eventId,
  eventTitle,
  price,
  registration,
  hasPendingPayment,
  authenticated,
  upiId,
  paymentInstructions,
  paymentSettingsError,
}: {
  eventId: string
  eventTitle: string
  price: number
  registration: Registration | null
  hasPendingPayment: boolean
  authenticated: boolean
  upiId: string | null
  paymentInstructions: string
  paymentSettingsError: string | null
}) {
  const [currentRegistration, setCurrentRegistration] = useState(registration)
  const [paymentPending, setPaymentPending] = useState(hasPendingPayment)
  const [utr, setUtr] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  async function register() {
    setMessage(null)
    if (price > 0 && !upiId) {
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
      setCurrentRegistration({
        id: data,
        status: price === 0 ? 'confirmed' : 'pending',
        payment_status: price === 0 ? 'not_required' : 'pending',
      })
      const registrationMessage = price === 0
        ? 'You are registered. Your place is confirmed.'
        : 'Registration saved. Complete the UPI payment below; your place is pending until an administrator verifies it.'
      setMessage(registrationMessage)
      try {
        const response = await fetch('/api/notifications/registration', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ registrationId: data }),
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
    const supabase = createSupabaseBrowserClient()
    if (!supabase || !currentRegistration) {
      setMessage('Sign in and register for this event before submitting payment details.')
      return
    }
    if (!upiId) {
      setMessage('UPI payment is not configured yet. The event organizer must set payment details in the admin panel.')
      return
    }

    setPending(true)
    try {
      const { error } = await supabase.rpc('submit_upi_payment', {
        p_registration_id: currentRegistration.id,
        p_utr: utr.trim(),
      })
      if (error) {
        setMessage(`Payment reference was not submitted: ${error.message}`)
        return
      }
      setPaymentPending(true)
      setCurrentRegistration({ ...currentRegistration, status: 'pending', payment_status: 'pending' })
      setMessage('Payment reference submitted. Your registration remains pending until an administrator verifies the transfer.')
      setUtr('')
    } catch (error) {
      setMessage(`Payment reference was not submitted: ${error instanceof Error ? error.message : 'Unexpected connection error.'}`)
    } finally {
      setPending(false)
    }
  }

  const upiLink = upiId
    ? `upi://pay?${new URLSearchParams({
        pa: upiId,
        pn: 'ULTIMATE EVENTS',
        am: Number(price).toFixed(2),
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
        {price === 0 ? 'This event is free.' : `Registration fee: ₹${Number(price).toFixed(2)}.`}
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
          <p className="mt-1"><span className="font-semibold">Payment:</span> {currentRegistration.payment_status.replace('_', ' ')}</p>
        </div>
      )}

      {currentRegistration && price > 0 && currentRegistration.payment_status !== 'verified' && !paymentPending && (
        <div className="mt-5 border-t pt-5">
          <h3 className="font-semibold">Pay by UPI</h3>
          {upiLink && (
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Send exactly ₹{Number(price).toFixed(2)} to <span className="font-semibold text-foreground">{upiId}</span>.{' '}
              <a href={upiLink} className="font-semibold text-foreground underline underline-offset-4">Open a UPI app</a>
            </p>
          )}
          {!upiId && <p className="mt-2 text-sm text-muted-foreground">UPI payment instructions are not available until the organizer configures the UPI ID.</p>}
          {paymentInstructions && <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{paymentInstructions}</p>}
          {paymentSettingsError && <p role="alert" className="mt-3 text-sm text-destructive">{paymentSettingsError}</p>}
          <form onSubmit={submitPayment} className="mt-4 flex flex-col gap-3">
            <label htmlFor="upi-utr" className="text-sm font-medium">UPI transaction reference / UTR</label>
            <input id="upi-utr" value={utr} onChange={(e) => setUtr(e.target.value)} className={inputClass} minLength={6} maxLength={100} required autoComplete="off" />
            <SubmitButton pending={pending}>{pending ? 'Submitting…' : 'Submit for verification'}</SubmitButton>
          </form>
        </div>
      )}
      {currentRegistration && paymentPending && (
        <p className="mt-4 rounded-lg border border-gold/40 bg-accent px-4 py-3 text-sm">
          Payment reference is awaiting administrator review. Your registration is not confirmed yet.
        </p>
      )}
      <FormResult message={message} />
    </section>
  )
}
