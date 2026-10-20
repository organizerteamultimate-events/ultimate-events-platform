'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { inputClass } from '@/components/forms/field'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

export type ParticipantCompetitionRecord = {
  registration_id: string
  event_id: string
  event_title: string
  submission: {
    id: string
    submission_url: string
    notes: string
    status: string
    score: number | null
    feedback: string
    submitted_at: string
  } | null
}

export function ParticipantSubmissionManager({
  competitions,
  userId,
  loadError,
}: {
  competitions: ParticipantCompetitionRecord[]
  userId: string
  loadError: string | null
}) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function save(record: ParticipantCompetitionRecord, form: HTMLFormElement) {
    const values = new FormData(form)
    const url = String(values.get('submission_url') ?? '').trim()
    const notes = String(values.get('notes') ?? '').trim()
    try {
      const parsed = new URL(url)
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Invalid protocol')
    } catch {
      setMessage('Enter a valid http or https link to your submission.')
      return
    }
    const supabase = createSupabaseBrowserClient()
    if (!supabase) {
      setMessage('Supabase is not configured.')
      return
    }
    setBusyId(record.registration_id)
    setMessage(null)
    try {
      const request = supabase.from('submissions')
      const { error } = record.submission
        ? await request.update({ submission_url: url, notes }).eq('id', record.submission.id)
        : await request.insert({
            registration_id: record.registration_id,
            event_id: record.event_id,
            user_id: userId,
            submission_url: url,
            notes,
          })
      if (error) {
        setMessage(`Submission was not saved: ${error.message}`)
        return
      }
      setMessage('Submission saved. An administrator will review the actual submitted link.')
      router.refresh()
    } catch (error) {
      setMessage(`Submission was not saved: ${error instanceof Error ? error.message : 'Unexpected connection error.'}`)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      {loadError && <p role="alert" className="mb-5 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{loadError}</p>}
      {message && <p role="status" className="mb-5 rounded-xl border bg-card px-4 py-3 text-sm">{message}</p>}
      {competitions.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card p-8 text-center">
          <h2 className="font-semibold">No eligible competition registrations</h2>
          <p className="mt-2 text-sm text-muted-foreground">Register for a published competition and confirm the registration before submitting work.</p>
        </div>
      ) : (
        <ul className="grid gap-4">
          {competitions.map((record) => (
            <li key={record.registration_id} className="rounded-2xl border bg-card p-5">
              <h2 className="font-bold">{record.event_title}</h2>
              {record.submission && (
                <div className="mt-3 rounded-lg bg-muted/50 p-3 text-sm">
                  <p>Status: <span className="font-semibold capitalize">{record.submission.status}</span>{record.submission.score !== null ? ` · Score: ${record.submission.score}` : ''}</p>
                  {record.submission.feedback && <p className="mt-2 whitespace-pre-wrap">{record.submission.feedback}</p>}
                  {record.submission.submitted_at && <p className="mt-2 text-xs text-muted-foreground">Submitted {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(record.submission.submitted_at))}</p>}
                </div>
              )}
              {(!record.submission || record.submission.status === 'pending') && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault()
                    void save(record, event.currentTarget)
                  }}
                  className="mt-4 grid gap-3"
                >
                  <label className="grid gap-1.5 text-sm font-medium">
                    Submission URL
                    <input name="submission_url" type="url" minLength={8} maxLength={2048} defaultValue={record.submission?.submission_url ?? ''} className={inputClass} required placeholder="https://" />
                  </label>
                  <label className="grid gap-1.5 text-sm font-medium">
                    Notes
                    <textarea name="notes" rows={3} maxLength={10000} defaultValue={record.submission?.notes ?? ''} className={inputClass} />
                  </label>
                  <button disabled={busyId !== null} className="h-10 rounded-lg bg-ink px-4 text-sm font-semibold text-ink-foreground disabled:opacity-60">
                    {busyId === record.registration_id ? 'Saving…' : record.submission ? 'Update submission' : 'Submit work'}
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
