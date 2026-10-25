'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Field, FormResult, SubmitButton, describedBy, inputClass } from './field'
import {
  getSafeInternalDestination,
  hasAdminAccess,
  isActiveAccountStatus,
  logAuthDiagnostic,
  normalizeEmail,
  validateLoginForm,
} from '@/lib/auth'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

export function LoginForm({
  variant = 'user',
  initialMessage = null,
}: {
  variant?: 'user' | 'admin'
  initialMessage?: string | null
}) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  const [result, setResult] = useState<string | null>(initialMessage)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setResult(null)
    const found = validateLoginForm(email, password)
    setErrors(found)
    if (Object.keys(found).length > 0) return

    setPending(true)
    try {
      const supabase = createSupabaseBrowserClient()
      if (!supabase) {
        setResult('Sign-in is not available yet. Check the Supabase project URL and publishable key configuration, then try again.')
        return
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizeEmail(email),
        password,
      })
      if (error) {
        logAuthDiagnostic('Sign-in', error)
        setResult(`Sign-in failed: ${error.message}`)
        return
      }

      if (variant === 'admin') {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role, account_status')
          .eq('id', data.user.id)
          .maybeSingle()

        if (profileError || !isActiveAccountStatus(profile?.account_status) || !hasAdminAccess(profile?.role)) {
          if (profileError) logAuthDiagnostic('Admin profile verification', profileError)
          const { error: signOutError } = await supabase.auth.signOut()
          if (signOutError) {
            logAuthDiagnostic('Admin sign-out after access rejection', signOutError)
            setResult(`Admin access was denied, and sign-out failed: ${signOutError.message}`)
            return
          }
          router.refresh()
          setResult(
            profileError
              ? `Admin access could not be verified: ${profileError.message}`
              : !isActiveAccountStatus(profile?.account_status)
                ? profile
                  ? 'This account is suspended or unavailable.'
                  : 'This account has no participant profile. Contact support to restore it.'
                : 'This account is not authorized as an administrator.',
          )
          return
        }
        router.replace('/admin')
        router.refresh()
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('account_status')
        .eq('id', data.user.id)
        .maybeSingle()
      if (profileError || !isActiveAccountStatus(profile?.account_status)) {
        if (profileError) logAuthDiagnostic('Profile status lookup', profileError)
        const { error: signOutError } = await supabase.auth.signOut()
        if (signOutError) logAuthDiagnostic('Sign-out after account rejection', signOutError)
        setResult(
          signOutError
            ? `This account is unavailable and sign-out failed: ${signOutError.message}`
            : profileError
              ? `Account status could not be verified: ${profileError.message}`
              : profile
                ? 'This account is suspended or unavailable. Contact support for assistance.'
                : 'This account has no participant profile. Contact support to restore it.',
        )
        return
      }

      const destination = getSafeInternalDestination(
        new URLSearchParams(window.location.search).get('next'),
        window.location.origin,
      )
      router.replace(destination)
      router.refresh()
    } catch (error) {
      logAuthDiagnostic('Sign-in', error)
      setResult(`Sign-in failed: ${error instanceof Error ? error.message : 'Unexpected connection error.'}`)
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <Field id="email" label="Email address" error={errors.email}>
        <input
          id="email"
          type="email"
          autoComplete="email"
          className={inputClass}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={describedBy('email', errors.email)}
          required
        />
      </Field>
      <Field id="password" label="Password" error={errors.password}>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          className={inputClass}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={describedBy('password', errors.password)}
          required
        />
      </Field>
      {variant === 'user' && (
        <div className="-mt-2 flex justify-end">
          <Link href="/forgot-password" className="text-sm font-medium underline-offset-4 hover:underline">
            Forgot password?
          </Link>
        </div>
      )}
      <FormResult message={result} />
      <SubmitButton pending={pending}>
        {pending ? 'Signing in…' : variant === 'admin' ? 'Sign in as Admin' : 'Login'}
      </SubmitButton>
      {variant === 'user' ? (
        <p className="text-center text-sm text-muted-foreground">
          New to ULTIMATE EVENTS?{' '}
          <Link href="/sign-up" className="font-semibold text-foreground underline-offset-4 hover:underline">
            Create Account
          </Link>
        </p>
      ) : (
        <p className="text-center text-xs leading-relaxed text-muted-foreground">
          Admin access is granted only through the secure bootstrap process. Public accounts cannot request the admin
          role.
        </p>
      )}
    </form>
  )
}
