'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export type AdminParticipantRecord = {
  id: string
  full_name: string
  email: string
  mobile: string
  organization: string | null
  qualification: string | null
  participant_id: string
  role: string
  account_status: 'active' | 'suspended' | 'deleted'
  created_at: string
}

export function AdminParticipantManager({
  participants,
  search,
  loadError,
}: {
  participants: AdminParticipantRecord[]
  search: string
  loadError: string | null
}) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function manage(participant: AdminParticipantRecord, action: 'suspend' | 'reactivate' | 'delete') {
    const label = action === 'delete' ? 'soft-delete' : action
    if (action === 'delete' && !window.confirm(`Delete ${participant.full_name}'s account? Their event history and permanent participant ID will be retained, while personal contact details are anonymized.`)) return
    const reason = window.prompt(`Optional reason for ${label} (up to 500 characters):`, '')
    if (reason === null) return

    setBusyId(participant.id)
    setMessage(null)
    try {
      const response = await fetch('/api/admin/participants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: participant.id, action, reason }),
      })
      const result = await response.json() as { error?: string; emailAccepted?: boolean }
      if (!response.ok) {
        setMessage(`Participant update failed: ${result.error ?? 'The server could not complete the action.'}`)
        return
      }
      setMessage(result.emailAccepted
        ? `Participant account ${action === 'reactivate' ? 'reactivated' : action === 'delete' ? 'deleted' : 'suspended'}; SMTP accepted the email for delivery. Delivery is not confirmed.`
        : `Participant account updated, but SMTP did not accept the email: ${result.error ?? 'email service unavailable'}`)
      router.refresh()
    } catch (error) {
      setMessage(`Participant update failed: ${error instanceof Error ? error.message : 'Unexpected connection error.'}`)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <form action="/admin/users" className="mb-5 flex flex-col gap-3 sm:flex-row">
        <label htmlFor="participant-search" className="sr-only">Search name, email, or participant ID</label>
        <input
          id="participant-search"
          name="q"
          defaultValue={search}
          maxLength={200}
          placeholder="Search name, email, or participant ID"
          className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-card px-3.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
        />
        <button className="h-11 rounded-lg bg-ink px-5 text-sm font-semibold text-ink-foreground">Search participants</button>
      </form>
      {loadError && <p role="alert" className="mb-5 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{loadError}</p>}
      {message && <p role="status" className="mb-5 rounded-xl border bg-card px-4 py-3 text-sm">{message}</p>}
      {participants.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          {search ? 'No participants matched your search.' : 'No participant accounts found.'}
        </p>
      ) : (
        <ul className="grid gap-3">
          {participants.map((participant) => (
            <li key={participant.id} className="rounded-xl border bg-card p-5">
              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                <div className="min-w-0">
                  <h2 className="font-semibold">{participant.full_name}</h2>
                  <p className="mt-1 break-all text-sm text-muted-foreground">{participant.email} · {participant.mobile || 'No phone'}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{[participant.organization, participant.qualification].filter(Boolean).join(' · ') || 'No organization or qualification provided'}</p>
                  <p className="mt-3 break-all font-mono text-xs text-muted-foreground">{participant.participant_id}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold">{participant.role}</span>
                  <span className="rounded-full border px-3 py-1 text-xs font-semibold capitalize">{participant.account_status}</span>
                  {participant.account_status === 'active' && (
                    <button
                      type="button"
                      disabled={busyId !== null}
                      onClick={() => manage(participant, 'suspend')}
                      className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-60"
                    >
                      {busyId === participant.id ? 'Saving…' : 'Suspend'}
                    </button>
                  )}
                  {participant.account_status === 'suspended' && (
                    <button
                      type="button"
                      disabled={busyId !== null}
                      onClick={() => manage(participant, 'reactivate')}
                      className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-60"
                    >
                      {busyId === participant.id ? 'Saving…' : 'Reactivate'}
                    </button>
                  )}
                  {participant.account_status !== 'deleted' && (
                    <button
                      type="button"
                      disabled={busyId !== null}
                      onClick={() => manage(participant, 'delete')}
                      className="rounded-lg border border-destructive/40 px-3 py-2 text-sm font-semibold text-destructive disabled:opacity-60"
                    >
                      Delete account
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
