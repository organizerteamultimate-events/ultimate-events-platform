'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

export type AdminPaymentRecord = {
  id: string
  registration_id: string
  user_id: string
  amount: number
  utr: string
  created_at: string
  participant_name: string
  participant_id: string
  event_title: string
}

export function AdminPaymentReview({
  payments,
  loadError,
}: {
  payments: AdminPaymentRecord[]
  loadError: string | null
}) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function review(paymentId: string, approve: boolean) {
    setBusyId(paymentId)
    setMessage(null)
    const supabase = createSupabaseBrowserClient()
    if (!supabase) {
      setMessage('Supabase is not configured.')
      setBusyId(null)
      return
    }
    try {
      const { error } = await supabase.rpc('review_upi_payment', {
        p_payment_id: paymentId,
        p_approve: approve,
      })
      if (error) {
        setMessage(`Payment review failed: ${error.message}`)
        return
      }
      let resultMessage = approve
        ? 'Payment verified and registration confirmed.'
        : 'Payment rejected; the participant may submit a corrected reference.'
      if (approve) {
        try {
          const response = await fetch('/api/notifications/payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentId }),
          })
          if (!response.ok) {
            const result = await response.json() as { error?: string }
            resultMessage += ` Receipt email was not sent: ${result.error ?? 'email service unavailable'}`
          }
        } catch {
          resultMessage += ' Receipt email could not be delivered; the payment remains verified.'
        }
      }
      setMessage(resultMessage)
      router.refresh()
    } catch (error) {
      setMessage(`Payment review failed: ${error instanceof Error ? error.message : 'Unexpected connection error.'}`)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      {loadError && <p role="alert" className="mb-5 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{loadError}</p>}
      {message && <p role="status" className="mb-5 rounded-xl border bg-card px-4 py-3 text-sm">{message}</p>}
      {payments.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card px-6 py-12 text-center">
          <h2 className="font-semibold">No payments awaiting review</h2>
          <p className="mt-2 text-sm text-muted-foreground">UPI transactions remain unverified until an administrator reviews the reference.</p>
        </div>
      ) : (
        <ul className="grid gap-4">
          {payments.map((payment) => (
            <li key={payment.id} className="rounded-2xl border bg-card p-5 shadow-sm">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div className="min-w-0">
                  <h2 className="font-bold">{payment.event_title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{payment.participant_name} · {payment.participant_id}</p>
                  <p className="mt-3 text-sm"><span className="font-semibold">Amount:</span> ₹{Number(payment.amount).toFixed(2)}</p>
                  <p className="mt-1 break-all text-sm"><span className="font-semibold">UPI reference:</span> {payment.utr}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Submitted {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(payment.created_at))}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button type="button" disabled={busyId !== null} onClick={() => review(payment.id, false)} className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-60">
                    {busyId === payment.id ? 'Saving…' : 'Reject'}
                  </button>
                  <button type="button" disabled={busyId !== null} onClick={() => review(payment.id, true)} className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-gold-foreground disabled:opacity-60">
                    {busyId === payment.id ? 'Saving…' : 'Verify payment'}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
