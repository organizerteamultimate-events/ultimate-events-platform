'use client'

import { useState } from 'react'
import { CalendarDays, Search } from 'lucide-react'
import { eventCategories } from '@/lib/site'
import type { EventRecord } from '@/lib/events'
import { inputClass } from '@/components/forms/field'
import { EmptyState } from '@/components/site/blocks'
import Link from 'next/link'

export function EventFilters({
  events,
  defaultCategory = '',
}: {
  events: EventRecord[]
  defaultCategory?: string
}) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState(defaultCategory)
  const [pricing, setPricing] = useState('')
  const [date, setDate] = useState('')

  const visibleEvents = events.filter((event) => {
    const matchesQuery = `${event.title} ${event.description}`.toLowerCase().includes(query.trim().toLowerCase())
    const matchesCategory = !category || event.category === category
    const matchesPrice = !pricing || (pricing === 'free' ? Number(event.price) === 0 : Number(event.price) > 0)
    const matchesDate = !date || !event.event_date || event.event_date.slice(0, 10) >= date
    return matchesQuery && matchesCategory && matchesPrice && matchesDate
  })

  return (
    <div className="flex flex-col gap-5">
      <form
        role="search"
        aria-label="Filter events"
        onSubmit={(e) => e.preventDefault()}
        className="grid gap-3 rounded-2xl border bg-card p-4 shadow-sm md:grid-cols-[2fr_1fr_1fr_1fr]"
      >
        <label className="relative">
          <span className="sr-only">Search events</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            placeholder="Search by title or keyword"
            className={`${inputClass} pl-10`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          <span className="sr-only">Category</span>
          <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {eventCategories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Free or paid</span>
          <select className={inputClass} value={pricing} onChange={(e) => setPricing(e.target.value)}>
            <option value="">Free and paid</option>
            <option value="free">Free</option>
            <option value="paid">Paid</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Starting from date</span>
          <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </form>

      {visibleEvents.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={events.length ? 'No matching events' : 'No events to show'}
          description={events.length
            ? 'Try changing or clearing your filters.'
            : 'Events published by administrators will appear here with dates, capacity, and registration options.'}
        />
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {visibleEvents.map((event) => (
            <li key={event.id} className="flex flex-col rounded-2xl border bg-card p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-gold hover:shadow-md">
              <div className="flex items-center justify-between gap-3">
                <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold">{event.category}</span>
                <span className="text-sm font-bold">{Number(event.price) === 0 ? 'Free' : `₹${Number(event.price).toFixed(2)}`}</span>
              </div>
              <h2 className="mt-4 text-xl font-bold">{event.title}</h2>
              <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-muted-foreground">
                {event.description || 'Event details will be shared after registration.'}
              </p>
              <p className="mt-5 text-sm text-muted-foreground">
                {event.event_date
                  ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.event_date))
                  : 'Date to be announced'}
                {event.capacity ? ` · ${event.capacity} places` : ''}
              </p>
              <Link href={`/events/${event.id}`} className="mt-5 inline-flex h-10 items-center justify-center rounded-lg bg-ink px-4 text-sm font-semibold text-ink-foreground transition-colors hover:bg-ink/90">
                View event
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
