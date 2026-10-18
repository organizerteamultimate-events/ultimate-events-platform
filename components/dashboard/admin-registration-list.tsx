'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

export type AdminRegistrationRecord = {
  id: string
  user_id: string
  status: string
  payment_status: string
  amount: number
  created_at: string
  participant_name: string
  participant_id: string
  event_title: string
}

export function AdminRegistrationList({
  registrations,
  loadError,
}: {
  registrations: AdminRegistrationRecord[]
  loadError: string | null
}) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function cancelRegistration(registrationId: string) {
    const supabase = createSupabaseBrowserClient()
    if (!supabase) {
      setMessage('Supabase is not configured.')
      return
    }
    setBusyId(registrationId)
    setMessage(null)
    try {
      const { error } = await supabase
        .from('registrations')
        .update({ status: 'cancelled' })
        .eq('id', registrationId)
      if (error) {
        setMessage(`Registration could not be cancelled: ${error.message}`)
        return
      }
      setMessage('Registration cancelled.')
      router.refresh()
    } catch (error) {
      setMessage(`Registration could not be cancelled: ${error instanceof Error ? error.message : 'Unexpected connection error.'}`)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      {loadError && <p role="alert" className="mb-5 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{loadError}</p>}
      {message && <p role="status" className="mb-5 rounded-xl border bg-card px-4 py-3 text-sm">{message}</p>}
      {registrations.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card px-6 py-12 text-center text-sm text-muted-foreground">No registration records found.</div>
      ) : (
        <ul className="grid gap-3">
          {registrations.map((registration) => (
            <li key={registration.id} className="rounded-xl border bg-card p-5">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div className="min-w-0">
                  <h2 className="font-semibold">{registration.event_title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{registration.participant_name} · {registration.participant_id}</p>
                  <p className="mt-2 break-all font-mono text-xs text-muted-foreground">{registration.id}</p>
                  <p className="mt-2 text-sm">
                    Registration: <span className="font-medium capitalize">{registration.status}</span>
                    {' · '}Payment: <span className="font-medium">{registration.payment_status.replace('_', ' ')}</span>
                    {' · '}{Number(registration.amount) === 0 ? 'Free' : `₹${Number(registration.amount).toFixed(2)}`}
                  </p>
                </div>
                {registration.status !== 'cancelled' && registration.payment_status !== 'verified' && (
                  <button type="button" disabled={busyId !== null} onClick={() => cancelRegistration(registration.id)} className="shrink-0 rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-60">
                    {busyId === registration.id ? 'Saving…' : 'Cancel registration'}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
