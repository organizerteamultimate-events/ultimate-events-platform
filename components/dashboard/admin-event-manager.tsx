'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { eventCategories } from '@/lib/site'
import type { EventRecord } from '@/lib/events'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { FormResult, inputClass } from '@/components/forms/field'

function formatDateTimeLocal(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

function isValidSchedule(opensAt: string, deadline: string, eventDate: string) {
  const opens = opensAt ? new Date(opensAt).getTime() : null
  const closes = deadline ? new Date(deadline).getTime() : null
  const event = eventDate ? new Date(eventDate).getTime() : null
  return (opens === null || Number.isFinite(opens))
    && (closes === null || Number.isFinite(closes))
    && (event === null || Number.isFinite(event))
    && (opens === null || closes === null || opens <= closes)
    && (opens === null || event === null || opens <= event)
    && (closes === null || event === null || closes <= event)
}

export function AdminEventManager({
  events,
  loadError,
}: {
  events: EventRecord[]
  loadError: string | null
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function createEvent(formData: FormData) {
    setMessage(null)
    const supabase = createSupabaseBrowserClient()
    if (!supabase) {
      setMessage('Supabase is not configured.')
      return
    }
    const title = String(formData.get('title') ?? '').trim()
    const category = String(formData.get('category') ?? '')
    const description = String(formData.get('description') ?? '').trim()
    const price = Number(formData.get('price') ?? 0)
    const capacityValue = String(formData.get('capacity') ?? '')
    const capacity = capacityValue ? Number(capacityValue) : null
    const eventDateValue = String(formData.get('event_date') ?? '')
    const opensAtValue = String(formData.get('registration_opens_at') ?? '')
    const deadlineValue = String(formData.get('registration_deadline') ?? '')
    const { data: authData, error: authError } = await supabase.auth.getUser()

    if (authError || !authData.user) {
      setMessage(`You must be signed in as an administrator. ${authError?.message ?? ''}`.trim())
      return
    }
    if (title.length < 3 || !category || !Number.isFinite(price) || price < 0 ||
        (capacity !== null && (!Number.isInteger(capacity) || capacity < 1))) {
      setMessage('Enter an event title, valid category, non-negative fee, and positive whole-number capacity.')
      return
    }
    if (!isValidSchedule(opensAtValue, deadlineValue, eventDateValue)) {
      setMessage('Registration opening and deadline must be at or before the event date, and opening must be at or before the deadline.')
      return
    }

    setPending(true)
    try {
      const { error } = await supabase.from('events').insert({
        title,
        category,
        description,
        price,
        capacity,
        event_date: eventDateValue ? new Date(eventDateValue).toISOString() : null,
        registration_opens_at: opensAtValue ? new Date(opensAtValue).toISOString() : null,
        registration_deadline: deadlineValue ? new Date(deadlineValue).toISOString() : null,
        status: 'draft',
        created_by: authData.user.id,
      })
      if (error) {
        setMessage(`Event was not saved: ${error.message}`)
        return
      }
      setMessage('Event saved as a draft. Publish it when it is ready for participants.')
      formRef.current?.reset()
      router.refresh()
    } catch (error) {
      setMessage(`Event was not saved: ${error instanceof Error ? error.message : 'Unexpected connection error.'}`)
    } finally {
      setPending(false)
    }
  }

  async function saveEvent(formData: FormData) {
    setMessage(null)
    const supabase = createSupabaseBrowserClient()
    if (!supabase) {
      setMessage('Supabase is not configured.')
      return
    }
    const id = String(formData.get('id') ?? '')
    const title = String(formData.get('title') ?? '').trim()
    const category = String(formData.get('category') ?? '')
    const price = Number(formData.get('price') ?? 0)
    const capacityValue = String(formData.get('capacity') ?? '')
    const capacity = capacityValue ? Number(capacityValue) : null
    const eventDateValue = String(formData.get('event_date') ?? '')
    const opensAtValue = String(formData.get('registration_opens_at') ?? '')
    const deadlineValue = String(formData.get('registration_deadline') ?? '')
    if (!id || title.length < 3 || !category || !Number.isFinite(price) || price < 0 ||
        (capacity !== null && (!Number.isInteger(capacity) || capacity < 1))) {
      setMessage('Enter a valid title, category, non-negative fee, and positive whole-number capacity.')
      return
    }
    if (!isValidSchedule(opensAtValue, deadlineValue, eventDateValue)) {
      setMessage('Registration opening and deadline must be at or before the event date, and opening must be at or before the deadline.')
      return
    }

    setPending(true)
    try {
      const { error } = await supabase.from('events').update({
        title,
        category,
        description: String(formData.get('description') ?? '').trim(),
        price,
        capacity,
        event_date: eventDateValue ? new Date(eventDateValue).toISOString() : null,
        registration_opens_at: opensAtValue ? new Date(opensAtValue).toISOString() : null,
        registration_deadline: deadlineValue ? new Date(deadlineValue).toISOString() : null,
      }).eq('id', id)
      if (error) {
        setMessage(`Event was not updated: ${error.message}`)
        return
      }
      setMessage('Event updated.')
      router.refresh()
    } catch (error) {
      setMessage(`Event was not updated: ${error instanceof Error ? error.message : 'Unexpected connection error.'}`)
    } finally {
      setPending(false)
    }
  }

  async function updateStatus(event: EventRecord, status: 'draft' | 'published' | 'cancelled' | 'completed') {
    setMessage(null)
    const supabase = createSupabaseBrowserClient()
    if (!supabase) {
      setMessage('Supabase is not configured.')
      return
    }
    setPending(true)
    try {
      const { error } = await supabase.from('events').update({ status }).eq('id', event.id)
      if (error) {
        setMessage(`Event status was not updated: ${error.message}`)
        return
      }
      setMessage(`Event ${status === 'published' ? 'published' : status === 'draft' ? 'unpublished' : status === 'completed' ? 'marked complete' : 'cancelled'}.`)
      router.refresh()
    } catch (error) {
      setMessage(`Event status was not updated: ${error instanceof Error ? error.message : 'Unexpected connection error.'}`)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {loadError && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{loadError}</p>}
      <section className="rounded-2xl border bg-card p-6 shadow-sm">
        <h2 className="text-xl font-bold">Create an event</h2>
        <p className="mt-1 text-sm text-muted-foreground">New events start as drafts and are not visible to the public until published.</p>
        <form
          ref={formRef}
          action={createEvent}
          className="mt-6 grid gap-4 sm:grid-cols-2"
        >
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Event title
            <input name="title" className={inputClass} minLength={3} maxLength={160} required />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Category
            <select name="category" className={inputClass} required defaultValue="">
              <option value="" disabled>Select a category</option>
              {eventCategories.map((category) => <option key={category}>{category}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Event date and time
            <input name="event_date" type="datetime-local" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Registration opens
            <input name="registration_opens_at" type="datetime-local" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Registration deadline
            <input name="registration_deadline" type="datetime-local" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Fee in INR
            <input name="price" type="number" min="0" step="0.01" defaultValue="0" className={inputClass} required />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Capacity <span className="font-normal text-muted-foreground">(optional)</span>
            <input name="capacity" type="number" min="1" step="1" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium sm:col-span-2">
            Description
            <textarea name="description" rows={4} maxLength={10000} className={inputClass} />
          </label>
          <button disabled={pending} className="inline-flex h-11 items-center justify-center rounded-lg bg-gold px-5 text-sm font-semibold text-gold-foreground hover:bg-gold/90 disabled:opacity-60 sm:col-span-2">
            {pending ? 'Saving…' : 'Save event draft'}
          </button>
        </form>
        <FormResult message={message} />
      </section>

      <section aria-labelledby="event-records-heading">
        <h2 id="event-records-heading" className="text-xl font-bold">Event records</h2>
        <p className="mt-1 text-sm text-muted-foreground">Canceling an event does not automatically refund UPI payments; resolve any paid registrations separately.</p>
        {events.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed bg-card px-5 py-8 text-center text-sm text-muted-foreground">No event records have been created.</p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {events.map((event) => (
              <li key={event.id} className="flex flex-col gap-4 rounded-xl border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold">{event.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{event.category} · {event.status} · {Number(event.price) === 0 ? 'Free' : `₹${Number(event.price).toFixed(2)}`}</p>
                  {(event.status === 'draft' || event.status === 'published') && (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-sm font-semibold underline underline-offset-4">Edit event</summary>
                      <form action={saveEvent} className="mt-4 grid gap-3 rounded-xl bg-muted/50 p-4 sm:grid-cols-2">
                        <input type="hidden" name="id" value={event.id} />
                        <label className="flex flex-col gap-1 text-sm font-medium">
                          Title
                          <input name="title" className={inputClass} defaultValue={event.title} minLength={3} maxLength={160} required />
                        </label>
                        <label className="flex flex-col gap-1 text-sm font-medium">
                          Category
                          <select name="category" className={inputClass} defaultValue={event.category} required>
                            {!eventCategories.includes(event.category) && <option value={event.category}>{event.category}</option>}
                            {eventCategories.map((category) => <option key={category}>{category}</option>)}
                          </select>
                        </label>
                        <label className="flex flex-col gap-1 text-sm font-medium">
                          Date and time
                          <input name="event_date" type="datetime-local" className={inputClass} defaultValue={formatDateTimeLocal(event.event_date)} />
                        </label>
                        <label className="flex flex-col gap-1 text-sm font-medium">
                          Registration opens
                          <input name="registration_opens_at" type="datetime-local" className={inputClass} defaultValue={formatDateTimeLocal(event.registration_opens_at)} />
                        </label>
                        <label className="flex flex-col gap-1 text-sm font-medium">
                          Registration deadline
                          <input name="registration_deadline" type="datetime-local" className={inputClass} defaultValue={formatDateTimeLocal(event.registration_deadline)} />
                        </label>
                        <label className="flex flex-col gap-1 text-sm font-medium">
                          Fee in INR
                          <input name="price" type="number" min="0" step="0.01" className={inputClass} defaultValue={Number(event.price)} required />
                        </label>
                        <label className="flex flex-col gap-1 text-sm font-medium">
                          Capacity
                          <input name="capacity" type="number" min="1" step="1" className={inputClass} defaultValue={event.capacity ?? ''} />
                        </label>
                        <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">
                          Description
                          <textarea name="description" rows={3} maxLength={10000} className={inputClass} defaultValue={event.description} />
                        </label>
                        <button disabled={pending} className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-ink-foreground disabled:opacity-60 sm:col-span-2">
                          {pending ? 'Saving…' : 'Save changes'}
                        </button>
                      </form>
                    </details>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {event.status === 'draft' && (
                    <button type="button" disabled={pending} onClick={() => updateStatus(event, 'published')} className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-gold-foreground disabled:opacity-60">Publish</button>
                  )}
                  {event.status === 'published' && (
                    <>
                      <button type="button" disabled={pending} onClick={() => updateStatus(event, 'draft')} className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-60">Unpublish</button>
                      <button type="button" disabled={pending} onClick={() => updateStatus(event, 'completed')} className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-60">Mark complete</button>
                      <button type="button" disabled={pending} onClick={() => updateStatus(event, 'cancelled')} className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-60">Cancel</button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
