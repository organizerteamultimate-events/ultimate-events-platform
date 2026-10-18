'use client'

import { useState } from 'react'
import { Field, FormResult, SubmitButton, describedBy, inputClass } from './field'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string>()
  const [result, setResult] = useState<string | null>(null)

  const [pending, setPending] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!emailPattern.test(email.trim())) {
      setError('Enter a valid email address.')
      setResult(null)
      return
    }
    setError(undefined)
    const supabase = createSupabaseBrowserClient()
    if (!supabase) {
      setResult('Password reset is not available yet. Add the Supabase project URL and publishable key, then try again.')
      return
    }

    setPending(true)
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      setResult(
        resetError
          ? `Reset email was not sent: ${resetError.message}`
          : 'If an account exists for that address, a password reset link has been sent.',
      )
    } catch (resetError) {
      setResult(`Reset email was not sent: ${resetError instanceof Error ? resetError.message : 'Unexpected connection error.'}`)
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <Field id="email" label="Email address" error={error}>
        <input
          id="email"
          type="email"
          autoComplete="email"
          className={inputClass}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy('email', error)}
        />
      </Field>
      <FormResult message={result} />
      <SubmitButton pending={pending}>{pending ? 'Sending…' : 'Send reset link'}</SubmitButton>
    </form>
  )
}

export function ContactForm() {
  const [values, setValues] = useState({ name: '', email: '', subject: '', message: '' })
  const [errors, setErrors] = useState<Partial<Record<keyof typeof values, string>>>({})
  const [result, setResult] = useState<string | null>(null)

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const found: typeof errors = {}
    if (values.name.trim().length < 2) found.name = 'Enter your name.'
    if (!emailPattern.test(values.email.trim())) found.email = 'Enter a valid email address.'
    if (values.subject.trim().length < 3) found.subject = 'Enter a subject.'
    if (values.message.trim().length < 10) found.message = 'Message must be at least 10 characters.'
    setErrors(found)
    setResult(
      Object.keys(found).length === 0
        ? 'Your message was not sent: the email provider is not configured yet. Nothing has been stored.'
        : null,
    )
  }

  const update = (key: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }))

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="name" label="Name" error={errors.name}>
          <input id="name" autoComplete="name" className={inputClass} value={values.name} onChange={update('name')} aria-invalid={errors.name ? true : undefined} aria-describedby={describedBy('name', errors.name)} />
        </Field>
        <Field id="contact-email" label="Email" error={errors.email}>
          <input id="contact-email" type="email" autoComplete="email" className={inputClass} value={values.email} onChange={update('email')} aria-invalid={errors.email ? true : undefined} aria-describedby={describedBy('contact-email', errors.email)} />
        </Field>
      </div>
      <Field id="subject" label="Subject" error={errors.subject}>
        <input id="subject" className={inputClass} value={values.subject} onChange={update('subject')} aria-invalid={errors.subject ? true : undefined} aria-describedby={describedBy('subject', errors.subject)} />
      </Field>
      <Field id="message" label="Message" error={errors.message}>
        <textarea id="message" rows={5} className={`${inputClass} h-auto py-3`} value={values.message} onChange={update('message')} aria-invalid={errors.message ? true : undefined} aria-describedby={describedBy('message', errors.message)} />
      </Field>
      <FormResult message={result} />
      <SubmitButton>Send message</SubmitButton>
    </form>
  )
}

export function CertificateVerifyForm() {
  const [id, setId] = useState('')
  const [error, setError] = useState<string>()
  const [result, setResult] = useState<string | null>(null)

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!/^[A-Z0-9-]{6,40}$/i.test(id.trim())) {
      setError('Enter a valid certificate ID, e.g. UE-CERT-2026-000001.')
      setResult(null)
      return
    }
    setError(undefined)
    setResult(
      `Certificate "${id.trim().toUpperCase()}" cannot be verified yet: the certificate database is not connected. This is not a confirmation of authenticity.`,
    )
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <Field id="certificate-id" label="Certificate ID" error={error}>
        <input
          id="certificate-id"
          className={`${inputClass} font-mono uppercase`}
          placeholder="UE-CERT-2026-000001"
          value={id}
          onChange={(e) => setId(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy('certificate-id', error)}
        />
      </Field>
      <FormResult message={result} />
      <SubmitButton>Verify certificate</SubmitButton>
    </form>
  )
}
