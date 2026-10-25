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
  receipt_path: string | null
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
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [message, setMessage] = useState<string | null>(null)

  async function review(paymentId: string, approve: boolean) {
    let rejectionReason = ''
    if (!approve) {
      const enteredReason = window.prompt('Enter a reason for rejecting this payment (3–500 characters):')
      if (enteredReason === null) return
      rejectionReason = enteredReason.trim()
      if (rejectionReason.length < 3 || rejectionReason.length > 500) {
        setMessage('Enter a rejection reason between 3 and 500 characters.')
        return
      }
    }
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
        p_rejection_reason: rejectionReason,
      })
      if (error) {
        setMessage(`Payment review failed: ${error.message}`)
        return
      }
      let resultMessage = approve
        ? 'Payment verified and registration confirmed.'
        : 'Payment rejected with a reason; the participant may submit a corrected reference.'
      try {
        const response = await fetch('/api/notifications/payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentId }),
        })
        if (!response.ok) {
          const result = await response.json() as { error?: string }
          resultMessage += ` Email was not accepted for delivery: ${result.error ?? 'email service unavailable'}`
        } else {
          resultMessage += ' Email accepted by SMTP for delivery.'
        }
      } catch {
        resultMessage += ' Email status could not be confirmed; the review remains saved.'
      }
      setMessage(resultMessage)
      router.refresh()
    } catch (error) {
      setMessage(`Payment review failed: ${error instanceof Error ? error.message : 'Unexpected connection error.'}`)
    } finally {
      setBusyId(null)
    }
  }

  function toggleSelection(paymentId: string) {
    setSelectedIds((current) => current.includes(paymentId)
      ? current.filter((id) => id !== paymentId)
      : [...current, paymentId])
  }

  async function reviewSelected(approve: boolean) {
    if (selectedIds.length === 0) return
    let rejectionReason = ''
    if (!approve) {
      const enteredReason = window.prompt('Enter a reason for rejecting the selected payments (3–500 characters):')
      if (enteredReason === null) return
      rejectionReason = enteredReason.trim()
      if (rejectionReason.length < 3 || rejectionReason.length > 500) {
        setMessage('Enter a rejection reason between 3 and 500 characters.')
        return
      }
    }
    const supabase = createSupabaseBrowserClient()
    if (!supabase) {
      setMessage('Supabase is not configured.')
      return
    }
    setBusyId('bulk')
    setMessage(null)
    try {
      const { error } = await supabase.rpc('review_upi_payments', {
        p_payment_ids: selectedIds,
        p_approve: approve,
        p_rejection_reason: rejectionReason,
      })
      if (error) {
        setMessage(`Bulk review failed. No selected payment was changed: ${error.message}`)
        return
      }
      let deliveryMessage = ''
      const notifications = await Promise.all(selectedIds.map(async (paymentId) => {
        try {
          const response = await fetch('/api/notifications/payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentId }),
          })
          return response.ok
        } catch {
          return false
        }
      }))
      const accepted = notifications.filter(Boolean).length
      deliveryMessage = ` ${accepted} status email${accepted === 1 ? '' : 's'} accepted by SMTP; ${notifications.length - accepted} failed or were not accepted.`
      setMessage(`${selectedIds.length} payment${selectedIds.length === 1 ? '' : 's'} ${approve ? 'verified' : 'rejected'} successfully.${deliveryMessage}`)
      setSelectedIds([])
      router.refresh()
    } catch (error) {
      setMessage(`Bulk review failed: ${error instanceof Error ? error.message : 'Unexpected connection error.'}`)
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
        <>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={payments.length > 0 && payments.every((payment) => selectedIds.includes(payment.id))}
              onChange={(event) => setSelectedIds(event.target.checked ? payments.map((payment) => payment.id) : [])}
              disabled={busyId !== null}
            />
            Select all pending ({selectedIds.length} selected)
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busyId !== null || selectedIds.length === 0} onClick={() => reviewSelected(false)} className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-60">
              {busyId === 'bulk' ? 'Saving…' : 'Reject selected'}
            </button>
            <button type="button" disabled={busyId !== null || selectedIds.length === 0} onClick={() => reviewSelected(true)} className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-gold-foreground disabled:opacity-60">
              {busyId === 'bulk' ? 'Saving…' : 'Verify selected'}
            </button>
          </div>
        </div>
        <ul className="grid gap-4">
          {payments.map((payment) => (
            <li key={payment.id} className="rounded-2xl border bg-card p-5 shadow-sm">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div className="min-w-0">
                  <label className="mb-3 inline-flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(payment.id)}
                      onChange={() => toggleSelection(payment.id)}
                      disabled={busyId !== null}
                    />
                    Select payment
                  </label>
                  <h2 className="font-bold">{payment.event_title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{payment.participant_name} · {payment.participant_id}</p>
                  <p className="mt-3 text-sm"><span className="font-semibold">Amount:</span> ₹{Number(payment.amount).toFixed(2)}</p>
                  <p className="mt-1 break-all text-sm"><span className="font-semibold">UPI reference:</span> {payment.utr}</p>
                  {payment.receipt_path ? (
                    <a
                      href={`/api/admin/payments/${encodeURIComponent(payment.id)}/receipt`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex text-sm font-semibold underline underline-offset-4"
                    >
                      View private receipt
                    </a>
                  ) : (
                    <p className="mt-2 text-sm text-amber-700">No receipt attached to this legacy payment.</p>
                  )}
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
        </>
      )}
    </div>
  )
}
