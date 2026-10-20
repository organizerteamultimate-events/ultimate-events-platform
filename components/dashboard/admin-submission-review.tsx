'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { inputClass } from '@/components/forms/field'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

export type AdminSubmissionRecord = {
  id: string
  user_id: string
  event_id: string
  submission_url: string
  notes: string
  status: 'pending' | 'accepted' | 'rejected'
  score: number | null
  feedback: string
  submitted_at: string
  participant_name: string
  participant_id: string
  event_title: string
}

export function AdminSubmissionReview({
  submissions,
  loadError,
}: {
  submissions: AdminSubmissionRecord[]
  loadError: string | null
}) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function review(submissionId: string, form: HTMLFormElement) {
    const formData = new FormData(form)
    const rawScore = String(formData.get('score') ?? '').trim()
    const score = rawScore ? Number(rawScore) : null
    if (score !== null && (!Number.isFinite(score) || score < 0)) {
      setMessage('Score must be a non-negative number.')
      return
    }
    const supabase = createSupabaseBrowserClient()
    if (!supabase) {
      setMessage('Supabase is not configured.')
      return
    }
    setBusyId(submissionId)
    setMessage(null)
    try {
      const { error } = await supabase.rpc('review_competition_submission', {
        p_submission_id: submissionId,
        p_status: String(formData.get('status')),
        p_score: score,
        p_feedback: String(formData.get('feedback') ?? '').trim(),
      })
      if (error) {
        setMessage(`Submission review failed: ${error.message}`)
        return
      }
      let notice = 'Submission review saved and a dashboard notification was recorded.'
      try {
        const response = await fetch('/api/admin/notifications/results', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ submissionId }),
        })
        if (!response.ok) {
          const result = await response.json() as { error?: string }
          notice += ` Email was not accepted by SMTP: ${result.error ?? 'email service unavailable'}`
        } else {
          notice += ' SMTP accepted the email for delivery; delivery is not confirmed.'
        }
      } catch {
        notice += ' Email acceptance could not be confirmed; the review is saved.'
      }
      setMessage(notice)
      router.refresh()
    } catch (error) {
      setMessage(`Submission review failed: ${error instanceof Error ? error.message : 'Unexpected connection error.'}`)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      {loadError && <p role="alert" className="mb-5 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{loadError}</p>}
      {message && <p role="status" className="mb-5 rounded-xl border bg-card px-4 py-3 text-sm">{message}</p>}
      {submissions.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-card px-6 py-12 text-center text-sm text-muted-foreground">No participant submissions have been received.</p>
      ) : (
        <ul className="grid gap-4">
          {submissions.map((submission) => (
            <li key={submission.id} className="rounded-2xl border bg-card p-5">
              <h2 className="font-bold">{submission.event_title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{submission.participant_name} · {submission.participant_id}</p>
              <a href={submission.submission_url} target="_blank" rel="noreferrer" className="mt-3 inline-block break-all text-sm font-medium underline underline-offset-4">
                Open participant submission
              </a>
              {submission.notes && <p className="mt-3 whitespace-pre-wrap text-sm">{submission.notes}</p>}
              <p className="mt-2 text-xs text-muted-foreground">Submitted {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(submission.submitted_at))}</p>
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  void review(submission.id, event.currentTarget)
                }}
                className="mt-5 grid gap-3 border-t pt-4 sm:grid-cols-2"
              >
                <label className="grid gap-1.5 text-sm font-medium">
                  Review status
                  <select name="status" className={inputClass} defaultValue={submission.status === 'pending' ? 'accepted' : submission.status}>
                    <option value="accepted">Accept</option>
                    <option value="rejected">Reject</option>
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm font-medium">
                  Score (optional)
                  <input name="score" type="number" min="0" step="0.01" defaultValue={submission.score ?? ''} className={inputClass} />
                </label>
                <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
                  Feedback
                  <textarea name="feedback" rows={3} maxLength={10000} defaultValue={submission.feedback} className={inputClass} />
                </label>
                <button disabled={busyId !== null} className="h-10 rounded-lg bg-ink px-4 text-sm font-semibold text-ink-foreground disabled:opacity-60 sm:col-span-2">
                  {busyId === submission.id ? 'Saving…' : 'Save review'}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
