'use client'

import { useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { FormResult, SubmitButton, inputClass } from '@/components/forms/field'

export function ProfileEditor({
  userId,
  profile,
}: {
  userId: string
  profile: {
    full_name: string
    mobile: string
    organization: string | null
    qualification: string | null
  }
}) {
  const [values, setValues] = useState({
    full_name: profile.full_name,
    mobile: profile.mobile,
    organization: profile.organization ?? '',
    qualification: profile.qualification ?? '',
  })
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)
    if (values.full_name.trim().length < 2 || !/^\+?[0-9]{10,15}$/.test(values.mobile.replace(/[\s-]/g, ''))) {
      setMessage('Enter your name and a valid mobile number (10–15 digits).')
      return
    }
    const supabase = createSupabaseBrowserClient()
    if (!supabase) {
      setMessage('Supabase is not configured.')
      return
    }

    setPending(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: values.full_name.trim(),
          mobile: values.mobile.replace(/[\s-]/g, ''),
          organization: values.organization.trim() || null,
          qualification: values.qualification.trim() || null,
        })
        .eq('id', userId)
      if (error) {
        setMessage(`Profile was not saved: ${error.message}`)
        return
      }
      setMessage('Profile saved.')
    } catch (error) {
      setMessage(`Profile was not saved: ${error instanceof Error ? error.message : 'Unexpected connection error.'}`)
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={save} className="rounded-2xl border bg-card p-6 shadow-sm">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Full name
          <input value={values.full_name} onChange={(e) => setValues({ ...values, full_name: e.target.value })} className={inputClass} autoComplete="name" required minLength={2} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Mobile number
          <input value={values.mobile} onChange={(e) => setValues({ ...values, mobile: e.target.value })} className={inputClass} type="tel" autoComplete="tel" required />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          College or organization
          <input value={values.organization} onChange={(e) => setValues({ ...values, organization: e.target.value })} className={inputClass} autoComplete="organization" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Qualification
          <input value={values.qualification} onChange={(e) => setValues({ ...values, qualification: e.target.value })} className={inputClass} />
        </label>
      </div>
      <div className="mt-5 flex flex-col items-start gap-3">
        <SubmitButton pending={pending}>{pending ? 'Saving…' : 'Save profile'}</SubmitButton>
        <FormResult message={message} />
      </div>
    </form>
  )
}
