'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { inputClass } from '@/components/forms/field'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

export type WinnerCandidate = {
  event_id: string
  event_title: string
  user_id: string
  participant_name: string
  participant_id: string
}

export type AdminWinnerRecord = WinnerCandidate & {
  id: string
  place: number
  award_title: string
  published: boolean
}

export function AdminWinnerManager({
  candidates,
  winners,
  loadError,
}: {
  candidates: WinnerCandidate[]
  winners: AdminWinnerRecord[]
  loadError: string | null
}) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function save(candidate: WinnerCandidate, form: HTMLFormElement) {
    const values = new FormData(form)
    const place = Number(values.get('place'))
    const awardTitle = String(values.get('award_title') ?? '').trim()
    const published = values.get('published') === 'on'
    const supabase = createSupabaseBrowserClient()
    if (!supabase) {
      setMessage('Supabase is not configured.')
      return
    }
    setBusyId(`${candidate.event_id}:${candidate.user_id}`)
    setMessage(null)
    try {
      const { data: winnerId, error } = await supabase.rpc('manage_event_winner', {
        p_event_id: candidate.event_id,
        p_user_id: candidate.user_id,
        p_place: place,
        p_award_title: awardTitle,
        p_published: published,
      })
      if (error) {
        setMessage(`Winner result was not saved: ${error.message}`)
        return
      }
      let notice = published ? 'Winner saved and published; a dashboard notification was recorded.' : 'Winner saved as an unpublished result.'
      if (published && winnerId) {
        try {
          const response = await fetch('/api/admin/notifications/results', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ winnerId }),
          })
          if (!response.ok) {
            const result = await response.json() as { error?: string }
            notice += ` Email was not accepted by SMTP: ${result.error ?? 'email service unavailable'}`
          } else {
            notice += ' SMTP accepted the email for delivery; delivery is not confirmed.'
          }
        } catch {
          notice += ' Email acceptance could not be confirmed; the result is saved.'
        }
      }
      setMessage(notice)
      router.refresh()
    } catch (error) {
      setMessage(`Winner result was not saved: ${error instanceof Error ? error.message : 'Unexpected connection error.'}`)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      {loadError && <p role="alert" className="mb-5 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{loadError}</p>}
      {message && <p role="status" className="mb-5 rounded-xl border bg-card px-4 py-3 text-sm">{message}</p>}
      {candidates.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-card px-6 py-12 text-center text-sm text-muted-foreground">Winners can be selected after a completed competition has accepted submissions.</p>
      ) : (
        <ul className="grid gap-4">
          {candidates.map((candidate) => {
            const key = `${candidate.event_id}:${candidate.user_id}`
            const existing = winners.find((winner) => winner.event_id === candidate.event_id && winner.user_id === candidate.user_id)
            return (
              <li key={key} className="rounded-2xl border bg-card p-5">
                <h2 className="font-bold">{candidate.event_title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{candidate.participant_name} · {candidate.participant_id}</p>
                <form
                  onSubmit={(event) => {
                    event.preventDefault()
                    void save(candidate, event.currentTarget)
                  }}
                  className="mt-4 grid gap-3 sm:grid-cols-[120px_1fr_auto]"
                >
                  <label className="grid gap-1 text-sm font-medium">
                    Place
                    <input name="place" type="number" min="1" max="100" defaultValue={existing?.place ?? 1} className={inputClass} required />
                  </label>
                  <label className="grid gap-1 text-sm font-medium">
                    Award
                    <input name="award_title" maxLength={160} defaultValue={existing?.award_title ?? 'Winner'} className={inputClass} required minLength={2} />
                  </label>
                  <div className="flex items-end gap-3">
                    <label className="flex h-10 items-center gap-2 text-sm">
                      <input name="published" type="checkbox" defaultChecked={existing?.published ?? true} />
                      Publish
                    </label>
                    <button disabled={busyId !== null} className="h-10 flex-1 rounded-lg bg-ink px-4 text-sm font-semibold text-ink-foreground disabled:opacity-60">
                      {busyId === key ? 'Saving…' : 'Save result'}
                    </button>
                  </div>
                </form>
              </li>
            )
          })}
        </ul>
      )}
      {winners.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-bold">Saved winner results</h2>
          <ul className="mt-3 grid gap-3">
            {winners.map((winner) => (
              <li key={winner.id} className="rounded-xl border bg-card p-4">
                <p className="font-semibold">{winner.event_title} · {winner.award_title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{winner.participant_name} · Place {winner.place} · {winner.published ? 'Published' : 'Unpublished'}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
