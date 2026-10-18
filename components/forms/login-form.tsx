'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Field, FormResult, SubmitButton, describedBy, inputClass } from './field'
import { hasAdminAccess, validateLoginForm } from '@/lib/auth'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

export function LoginForm({ variant = 'user' }: { variant?: 'user' | 'admin' }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  const [result, setResult] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setResult(null)
    const found = validateLoginForm(email, password)
    setErrors(found)
    if (Object.keys(found).length > 0) return

    const supabase = createSupabaseBrowserClient()
    if (!supabase) {
      setResult('Sign-in is not available yet. Add the Supabase project URL and publishable key, then try again.')
      return
    }

    setPending(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      })
      if (error) {
        setResult(`Sign-in failed: ${error.message}`)
        return
      }

      if (variant === 'admin') {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', data.user.id)
          .maybeSingle()

        if (profileError || !hasAdminAccess(profile?.role)) {
          const { error: signOutError } = await supabase.auth.signOut()
          if (signOutError) {
            setResult(`Admin access was denied, and sign-out failed: ${signOutError.message}`)
            return
          }
          setResult(
            profileError
              ? `Admin access could not be verified: ${profileError.message}`
              : 'This account is not authorized as an administrator.',
          )
          return
        }
        router.push('/admin')
        return
      }

      router.push('/dashboard')
    } catch (error) {
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
