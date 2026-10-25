'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Field, FormResult, SubmitButton, describedBy, inputClass } from './field'
import {
  buildAbsoluteUrl,
  getSignUpErrorMessage,
  isProvisionedProfile,
  logAuthDiagnostic,
  normalizeEmail,
  normalizeMobile,
  validateSignUp,
  type SignUpErrors,
  type SignUpValues,
} from '@/lib/auth'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

type Values = SignUpValues

type Errors = SignUpErrors

const initial: Values = {
  fullName: '',
  email: '',
  mobile: '',
  organization: '',
  qualification: '',
  password: '',
  confirmPassword: '',
  terms: false,
}

function validate(v: Values): Errors {
  return validateSignUp(v)
}

export function SignUpForm() {
  const router = useRouter()
  const [values, setValues] = useState<Values>(initial)
  const [errors, setErrors] = useState<Errors>({})
  const [result, setResult] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const set = <K extends keyof Values>(key: K, value: Values[K]) => setValues((v) => ({ ...v, [key]: value }))

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setResult(null)
    const found = validate(values)
    setErrors(found)
    if (Object.keys(found).length > 0) return

    setPending(true)
    try {
      const supabase = createSupabaseBrowserClient()
      if (!supabase) {
        setResult('Account creation is not available yet. Check the Supabase project URL and publishable key configuration, then try again.')
        return
      }

      const { data, error } = await supabase.auth.signUp({
        email: normalizeEmail(values.email),
        password: values.password,
        options: {
          emailRedirectTo: buildAbsoluteUrl('/auth/callback', { next: '/dashboard' }),
          data: {
            full_name: values.fullName.trim(),
            mobile: normalizeMobile(values.mobile),
            organization: values.organization.trim(),
            qualification: values.qualification.trim(),
          },
        },
      })

      if (error) {
        logAuthDiagnostic('Sign-up', error)
        setResult(`Account was not created: ${getSignUpErrorMessage(error)}`)
        return
      }

      if (data.session && data.user) {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id, email')
          .eq('id', data.user.id)
          .maybeSingle()

        if (profileError || !isProvisionedProfile(profile, data.user.id, data.user.email ?? values.email)) {
          if (profileError) logAuthDiagnostic('Profile verification after sign-up', profileError)
          const { error: signOutError } = await supabase.auth.signOut()
          if (signOutError) logAuthDiagnostic('Sign-out after profile verification failure', signOutError)
          setResult(
            signOutError
              ? `Your account was created, but its participant profile could not be verified and sign-out failed: ${signOutError.message}`
              : profileError
                ? `Your account was created, but its participant profile could not be verified: ${profileError.message}`
                : 'Your account was created, but its participant profile is missing or does not match your email. Contact support before signing in.',
          )
          return
        }

        router.replace('/dashboard')
        router.refresh()
        return
      }
      setResult(
        'If email confirmation is enabled, check your inbox to verify your address. If you already have an account, try logging in or resetting your password.',
      )
    } catch (error) {
      logAuthDiagnostic('Sign-up', error)
      setResult(`Account creation could not be confirmed: ${error instanceof Error ? error.message : 'Unexpected connection error.'}`)
    } finally {
      setPending(false)
    }
  }

  const text = (
    key: Exclude<keyof Values, 'terms'>,
    label: string,
    props: React.InputHTMLAttributes<HTMLInputElement> & { optional?: boolean; hint?: string } = {},
  ) => {
    const { optional, hint, ...rest } = props
    return (
      <Field id={key} label={label} error={errors[key]} hint={hint} optional={optional}>
        <input
          id={key}
          name={key}
          className={inputClass}
          value={values[key]}
          onChange={(e) => set(key, e.target.value)}
          aria-invalid={errors[key] ? true : undefined}
          aria-describedby={describedBy(key, errors[key], hint)}
          required={!optional}
          {...rest}
        />
      </Field>
    )
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {text('fullName', 'Full name', { autoComplete: 'name' })}
      <div className="grid gap-5 sm:grid-cols-2">
        {text('email', 'Email address', { type: 'email', autoComplete: 'email' })}
        {text('mobile', 'Mobile number', { type: 'tel', autoComplete: 'tel', inputMode: 'tel' })}
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        {text('organization', 'College or organization', { optional: true, autoComplete: 'organization' })}
        {text('qualification', 'Qualification', { optional: true })}
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        {text('password', 'Password', {
          type: 'password',
          autoComplete: 'new-password',
          hint: 'At least 10 characters with a letter and a number.',
        })}
        {text('confirmPassword', 'Confirm password', { type: 'password', autoComplete: 'new-password' })}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="flex items-start gap-3 text-sm leading-relaxed">
          <input
            type="checkbox"
            checked={values.terms}
            onChange={(e) => set('terms', e.target.checked)}
            className="mt-1 size-4 accent-[var(--gold)]"
            aria-invalid={errors.terms ? true : undefined}
            aria-describedby={errors.terms ? 'terms-error' : undefined}
          />
          <span>
            I accept the{' '}
            <Link href="/terms" className="font-medium underline underline-offset-4">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="font-medium underline underline-offset-4">
              Privacy Policy
            </Link>
            .
          </span>
        </label>
        {errors.terms && (
          <p id="terms-error" className="text-xs font-medium text-destructive">
            {errors.terms}
          </p>
        )}
      </div>

      <FormResult message={result} />
      <SubmitButton pending={pending}>{pending ? 'Creating account…' : 'Create Account'}</SubmitButton>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold text-foreground underline-offset-4 hover:underline">
          Login
        </Link>
      </p>
    </form>
  )
}
