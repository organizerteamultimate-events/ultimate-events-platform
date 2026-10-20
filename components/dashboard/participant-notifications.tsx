'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

export type ParticipantNotification = {
  id: string
  kind: string
  title: string
  message: string
  created_at: string
  read_at: string | null
}

export function ParticipantNotifications({
  notifications,
  loadError,
}: {
  notifications: ParticipantNotification[]
  loadError: string | null
}) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function markRead(id: string) {
    const supabase = createSupabaseBrowserClient()
    if (!supabase) {
      setMessage('Supabase is not configured.')
      return
    }
    setBusyId(id)
    setMessage(null)
    try {
      const { error } = await supabase.rpc('set_notification_read', { p_notification_id: id })
      if (error) {
        setMessage(`Notification could not be updated: ${error.message}`)
        return
      }
      router.refresh()
    } catch (error) {
      setMessage(`Notification could not be updated: ${error instanceof Error ? error.message : 'Unexpected connection error.'}`)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      {loadError && <p role="alert" className="mb-5 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{loadError}</p>}
      {message && <p role="status" className="mb-5 rounded-xl border bg-card px-4 py-3 text-sm">{message}</p>}
      {notifications.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-card px-6 py-12 text-center text-sm text-muted-foreground">No notifications have been recorded.</p>
      ) : (
        <ul className="grid gap-3">
          {notifications.map((notification) => (
            <li key={notification.id} className={`rounded-xl border bg-card p-5 ${notification.read_at ? '' : 'border-gold'}`}>
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{notification.kind}</p>
                  <h2 className="mt-1 font-semibold">{notification.title}</h2>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{notification.message}</p>
                  <p className="mt-3 text-xs text-muted-foreground">{new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(notification.created_at))}</p>
                </div>
                {!notification.read_at && (
                  <button type="button" disabled={busyId !== null} onClick={() => markRead(notification.id)} className="shrink-0 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-60">
                    {busyId === notification.id ? 'Saving…' : 'Mark read'}
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
