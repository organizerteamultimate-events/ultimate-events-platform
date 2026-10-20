'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export type AdminCertificateRecord = {
  id: string
  certificate_number: string
  recipient_name: string
  participant_id: string
  event_name: string
  issued_at: string
  revoked_at: string | null
}

export type CompletedEventRecord = { id: string; title: string }

export function AdminCertificateManager({
  events,
  certificates,
  loadError,
}: {
  events: CompletedEventRecord[]
  certificates: AdminCertificateRecord[]
  loadError: string | null
}) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function issue(event: CompletedEventRecord) {
    setBusyId(event.id)
    setMessage(null)
    try {
      const response = await fetch('/api/admin/certificates/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: event.id }),
      })
      const result = await response.json() as { error?: string; issued?: number; emailsAccepted?: number; emailError?: string }
      if (!response.ok) {
        setMessage(`Certificates were not issued: ${result.error ?? 'The server could not complete this action.'}`)
        return
      }
      setMessage(`${result.issued ?? 0} certificate${result.issued === 1 ? '' : 's'} issued. SMTP accepted ${result.emailsAccepted ?? 0} email notification${result.emailsAccepted === 1 ? '' : 's'}; delivery is not confirmed.${result.emailError ? ` ${result.emailError}` : ''}`)
      router.refresh()
    } catch (error) {
      setMessage(`Certificate issue failed: ${error instanceof Error ? error.message : 'Unexpected connection error.'}`)
    } finally {
      setBusyId(null)
    }
  }

  async function revoke(certificate: AdminCertificateRecord) {
    const reason = window.prompt(`Reason for revoking ${certificate.certificate_number}:`)
    if (!reason) return
    setBusyId(certificate.id)
    setMessage(null)
    try {
      const response = await fetch('/api/admin/certificates/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certificateId: certificate.id, reason }),
      })
      const result = await response.json() as { error?: string; emailAccepted?: boolean }
      if (!response.ok) {
        setMessage(`Certificate was not revoked: ${result.error ?? 'The server could not complete this action.'}`)
        return
      }
      setMessage(result.emailAccepted
        ? 'Certificate revoked; SMTP accepted the email for delivery. Delivery is not confirmed.'
        : `Certificate revoked, but SMTP did not accept the email: ${result.error ?? 'email service unavailable'}`)
      router.refresh()
    } catch (error) {
      setMessage(`Certificate revocation failed: ${error instanceof Error ? error.message : 'Unexpected connection error.'}`)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="grid gap-8">
      {loadError && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{loadError}</p>}
      {message && <p role="status" className="rounded-xl border bg-card px-4 py-3 text-sm">{message}</p>}
      <section>
        <h2 className="text-lg font-bold">Issue eligible certificates</h2>
        <p className="mt-1 text-sm text-muted-foreground">Only confirmed registrations for completed events are eligible. Existing active certificates are not duplicated.</p>
        {events.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed bg-card p-5 text-sm text-muted-foreground">No completed events are available for certificate issuance.</p>
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {events.map((event) => (
              <li key={event.id} className="flex flex-col justify-between gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center">
                <span className="font-semibold">{event.title}</span>
                <button type="button" disabled={busyId !== null} onClick={() => issue(event)} className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-gold-foreground disabled:opacity-60">
                  {busyId === event.id ? 'Issuing…' : 'Issue eligible'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="text-lg font-bold">Issued certificates</h2>
        {certificates.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed bg-card p-5 text-sm text-muted-foreground">No certificates have been issued.</p>
        ) : (
          <ul className="mt-3 grid gap-3">
            {certificates.map((certificate) => (
              <li key={certificate.id} className="flex flex-col justify-between gap-3 rounded-xl border bg-card p-4 md:flex-row md:items-center">
                <div className="min-w-0">
                  <p className="font-semibold">{certificate.recipient_name} · {certificate.event_name}</p>
                  <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{certificate.certificate_number} · {certificate.participant_id}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{certificate.revoked_at ? 'Revoked' : 'Active'} · {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(certificate.issued_at))}</p>
                </div>
                {!certificate.revoked_at && (
                  <button type="button" disabled={busyId !== null} onClick={() => revoke(certificate)} className="shrink-0 rounded-lg border border-destructive/40 px-4 py-2 text-sm font-semibold text-destructive disabled:opacity-60">
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
