'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AuthShell } from '@/components/site/auth-shell'
import { Field, FormResult, SubmitButton, inputClass } from '@/components/forms/field'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setResult(null)

    if (password.length < 10 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      setResult('Use at least 10 characters with at least one letter and one number.')
      return
    }
    if (password !== confirmation) {
      setResult('Passwords do not match.')
      return
    }

    const supabase = createSupabaseBrowserClient()
    if (!supabase) {
      setResult('Supabase is not configured. Add the public Supabase URL and key, then try again.')
      return
    }

    setPending(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) {
        setResult(`Password was not changed: ${error.message}`)
        return
      }
      router.push('/dashboard')
    } catch (error) {
      setResult(`Password was not changed: ${error instanceof Error ? error.message : 'Unexpected connection error.'}`)
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthShell
      title="Choose a new password"
      description="Use a strong password you have not used elsewhere."
      feature="Password reset"
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <Field id="password" label="New password">
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            className={inputClass}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={10}
          />
        </Field>
        <Field id="confirmation" label="Confirm new password">
          <input
            id="confirmation"
            type="password"
            autoComplete="new-password"
            className={inputClass}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            required
            minLength={10}
          />
        </Field>
        <FormResult message={result} />
        <SubmitButton pending={pending}>{pending ? 'Updating password…' : 'Update password'}</SubmitButton>
      </form>
    </AuthShell>
  )
}
