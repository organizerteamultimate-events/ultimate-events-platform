import type { Metadata } from 'next'
import { Code2, Lock, Scale, Timer } from 'lucide-react'
import { EmptyState, PageHeader, SetupNotice } from '@/components/site/blocks'
import { EventFilters } from '@/components/events/event-filters'
import { getPublishedEvents } from '@/lib/events'
import { isSupabaseConfigured } from '@/lib/supabase/config'

export const metadata: Metadata = { title: 'Coding Competitions' }

const rules = [
  { icon: Timer, title: 'Timed rounds', text: 'Each competition has a registration deadline, start and end times, and a live countdown.' },
  { icon: Lock, title: 'Sandboxed judging', text: 'Submissions run on an external judging service, never on the main application server.' },
  { icon: Scale, title: 'Fair ranking', text: 'Ties are broken by earliest accepted submission time, then fewest incorrect attempts.' },
]

export default async function CompetitionsPage() {
  const { events, error } = await getPublishedEvents()

  return (
    <>
      <PageHeader
        eyebrow="Coding Competitions"
        title="Solve. Submit. Rank."
        description="Problem statements, configured languages, test-case results, and transparent scoring."
      />
      <div className="mx-auto flex max-w-7xl flex-col gap-10 px-4 py-12 sm:px-6">
        <ul className="grid gap-5 md:grid-cols-3">
          {rules.map(({ icon: Icon, title, text }) => (
            <li key={title} className="rounded-2xl border bg-card p-6">
              <Icon className="size-6 text-gold" aria-hidden="true" />
              <h2 className="mt-4 text-lg font-bold">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
            </li>
          ))}
        </ul>
        {!isSupabaseConfigured() ? (
          <SetupNotice feature="Competition listings" />
        ) : error ? (
          <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            Competition listings could not be loaded. Apply the events migration in Supabase, then reload this page.
          </p>
        ) : events.some((event) => event.category === 'Coding Competition') ? (
          <EventFilters events={events.filter((event) => event.category === 'Coding Competition')} defaultCategory="Coding Competition" />
        ) : (
          <EmptyState
            icon={Code2}
            title="No competitions announced"
            description="Upcoming and active competitions will appear here once administrators create and publish them. Code judging remains a separate integration."
          />
        )}
      </div>
    </>
  )
}
