'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { inputClass } from '@/components/forms/field'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

const qrBucket = 'ultimate-event-payment-qr'
const qrImageTypes = ['image/png', 'image/jpeg', 'image/webp']
const maxQrImageBytes = 2 * 1024 * 1024

export function AdminPaymentSettings({
  initialUpiId,
  initialAccountHolderName,
  initialQrImagePath,
  initialInstructions,
  loadError,
}: {
  initialUpiId: string
  initialAccountHolderName: string
  initialQrImagePath: string | null
  initialInstructions: string
  loadError: string | null
}) {
  const router = useRouter()
  const [upiId, setUpiId] = useState(initialUpiId)
  const [accountHolderName, setAccountHolderName] = useState(initialAccountHolderName)
  const [qrImagePath, setQrImagePath] = useState(initialQrImagePath)
  const [removeQr, setRemoveQr] = useState(false)
  const [instructions, setInstructions] = useState(initialInstructions)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)
    const form = event.currentTarget
    const qrFile = (form.elements.namedItem('qr_image') as HTMLInputElement | null)?.files?.[0] ?? null
    if (upiId.trim() && !/^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+$/.test(upiId.trim())) {
      setMessage('Enter a valid UPI ID.')
      return
    }
    if (qrFile) {
      if (!qrImageTypes.some((type) => type === qrFile.type) || qrFile.size < 1 || qrFile.size > maxQrImageBytes) {
        setMessage('QR image must be a PNG, JPEG, or WebP no larger than 2 MB.')
        return
      }
    }
    setPending(true)
    let uploadedQrPath: string | null = null
    let settingsRpcStarted = false
    try {
      const supabase = createSupabaseBrowserClient()
      if (!supabase) {
        setMessage('Supabase is not configured.')
        return
      }
      let nextQrPath = removeQr ? null : qrImagePath
      if (qrFile) {
        const extension = qrFile.type === 'image/jpeg' ? 'jpg' : qrFile.type.slice('image/'.length)
        uploadedQrPath = `${crypto.randomUUID()}.${extension}`
        const { error: uploadError } = await supabase.storage.from(qrBucket).upload(uploadedQrPath, qrFile, {
          contentType: qrFile.type,
          upsert: false,
        })
        if (uploadError) {
          setMessage(`QR image was not uploaded: ${uploadError.message}`)
          return
        }
        nextQrPath = uploadedQrPath
      }

      settingsRpcStarted = true
      const { error } = await supabase.rpc('update_payment_settings', {
        p_upi_id: upiId.trim(),
        p_account_holder_name: accountHolderName.trim(),
        p_qr_image_path: nextQrPath,
        p_instructions: instructions.trim(),
      })
      if (error) {
        const { data: savedSettings, error: verifyError } = await supabase
          .from('platform_settings')
            .select('upi_id, account_holder_name, qr_image_path, payment_instructions')
            .eq('id', true)
            .maybeSingle()
          if (
            !verifyError &&
            savedSettings?.upi_id === upiId.trim() &&
            savedSettings.account_holder_name === accountHolderName.trim() &&
            savedSettings.qr_image_path === nextQrPath &&
            savedSettings.payment_instructions === instructions.trim()
          ) {
          setQrImagePath(nextQrPath)
          setRemoveQr(false)
          form.reset()
          setMessage('Payment settings saved.')
          router.refresh()
          return
        }
        if (verifyError) console.error('Could not verify payment settings after an RPC error', verifyError)
        console.error('Payment settings update returned an error', error)
        setMessage('Payment settings could not be confirmed. The QR image was retained safely; reload the page before retrying.')
        return
      }
      if (qrImagePath && (removeQr || uploadedQrPath) && qrImagePath !== nextQrPath) {
        const { error: cleanupError } = await supabase.storage.from(qrBucket).remove([qrImagePath])
        if (cleanupError) console.error('Payment settings saved, but the previous QR image could not be removed', cleanupError)
      }
      setQrImagePath(nextQrPath)
      setRemoveQr(false)
      form.reset()
      setMessage('Payment settings saved.')
      router.refresh()
    } catch (error) {
      if (uploadedQrPath && !settingsRpcStarted) {
        try {
          const supabase = createSupabaseBrowserClient()
          const { error: cleanupError } = supabase
            ? await supabase.storage.from(qrBucket).remove([uploadedQrPath])
            : { error: new Error('Supabase is not configured.') }
          if (cleanupError) console.error('Could not remove an unreferenced payment QR image', cleanupError)
        } catch (cleanupError) {
          console.error('Could not remove an unreferenced payment QR image', cleanupError)
        }
      }
      console.error('Payment settings save failed', error)
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
          Account holder / display name
          <input
            value={accountHolderName}
            onChange={(event) => setAccountHolderName(event.target.value)}
            className={inputClass}
            autoComplete="organization"
            maxLength={160}
            placeholder="Name shown to participants"
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          UPI QR image <span className="font-normal text-muted-foreground">(PNG, JPEG, or WebP; max 2 MB)</span>
          <input name="qr_image" type="file" accept="image/png,image/jpeg,image/webp" className={inputClass} />
        </label>
        {qrImagePath && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={removeQr} onChange={(event) => setRemoveQr(event.target.checked)} />
            Remove the current QR image
          </label>
        )}
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
        <button type="submit" disabled={pending} className="inline-flex h-11 items-center justify-center rounded-lg bg-gold px-5 text-sm font-semibold text-gold-foreground disabled:opacity-60">
          {pending ? 'Saving…' : 'Save payment details'}
        </button>
      </form>
    </section>
  )
}
