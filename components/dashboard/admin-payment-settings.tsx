'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { inputClass } from '@/components/forms/field'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

export function AdminPaymentSettings({
  initialUpiId,
  initialInstructions,
  loadError,
}: {
  initialUpiId: string
  initialInstructions: string
  loadError: string | null
}) {
  const router = useRouter()
  const [upiId, setUpiId] = useState(initialUpiId)
  const [instructions, setInstructions] = useState(initialInstructions)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)
    const supabase = createSupabaseBrowserClient()
    if (!supabase) {
      setMessage('Supabase is not configured.')
      return
    }
    setPending(true)
    try {
      const { error } = await supabase.rpc('update_payment_settings', {
        p_upi_id: upiId.trim(),
        p_instructions: instructions.trim(),
      })
      if (error) {
        setMessage(`Payment settings were not saved: ${error.message}`)
        return
      }
      setMessage('Payment settings saved.')
      router.refresh()
    } catch (error) {
      setMessage(`Payment settings were not saved: ${error instanceof Error ? error.message : 'Unexpected connection error.'}`)
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-6 shadow-sm">
      <h2 className="text-xl font-bold">Manual UPI payments</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        These public payment details are shown for paid events. Never enter a provider secret here.
      </p>
      {loadError && <p role="alert" className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{loadError}</p>}
      <form onSubmit={save} className="mt-5 grid gap-4">
        <label className="grid gap-1.5 text-sm font-medium">
          Business UPI ID
          <input
            value={upiId}
            onChange={(event) => setUpiId(event.target.value)}
            className={inputClass}
            autoComplete="off"
            maxLength={255}
            placeholder="business@bank"
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Payment instructions
          <textarea
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            className={inputClass}
            rows={4}
            maxLength={4000}
          />
        </label>
        {message && <p role="status" className="text-sm">{message}</p>}
        <button disabled={pending} className="inline-flex h-11 items-center justify-center rounded-lg bg-gold px-5 text-sm font-semibold text-gold-foreground disabled:opacity-60">
          {pending ? 'Saving…' : 'Save payment details'}
        </button>
      </form>
    </section>
  )
}
