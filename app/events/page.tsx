import type { Metadata } from 'next'
import { PageHeader, SetupNotice } from '@/components/site/blocks'
import { EventFilters } from '@/components/events/event-filters'
import { getPublishedEvents } from '@/lib/events'
import { isSupabaseConfigured } from '@/lib/supabase/config'

export const metadata: Metadata = { title: 'Explore Events' }

export default async function EventsPage() {
  const { events, error } = await getPublishedEvents()

  return (
    <>
      <PageHeader
        eyebrow="Explore Events"
        title="Find your next event"
        description="Workshops, webinars, quizzes, coding competitions, technical events, and skill-development programs."
      />
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-12 sm:px-6">
        {!isSupabaseConfigured() ? (
          <SetupNotice feature="Event listings" />
        ) : error ? (
          <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            Event data could not be loaded. Confirm the connected database has the application event columns and RLS policies, then reload this page.
          </p>
        ) : (
          <EventFilters events={events} />
        )}
      </div>
    </>
  )
}
