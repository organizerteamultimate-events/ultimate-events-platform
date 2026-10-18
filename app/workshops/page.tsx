import type { Metadata } from 'next'
import { PageHeader, SetupNotice } from '@/components/site/blocks'
import { EventFilters } from '@/components/events/event-filters'
import { getPublishedEvents } from '@/lib/events'
import { isSupabaseConfigured } from '@/lib/supabase/config'

export const metadata: Metadata = { title: 'Workshops' }

export default async function WorkshopsPage() {
  const { events, error } = await getPublishedEvents()

  return (
    <>
      <PageHeader
        eyebrow="Workshops"
        title="Learn by doing"
        description="Free and paid workshops with clear schedules, capacity limits, participation instructions, and certificate eligibility."
      />
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-12 sm:px-6">
        {!isSupabaseConfigured() ? (
          <SetupNotice feature="Workshop listings" />
        ) : error ? (
          <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            Workshop data could not be loaded. Apply the events migration in the Supabase SQL Editor, then reload this page.
          </p>
        ) : (
          <EventFilters events={events.filter((event) => event.category === 'Workshop')} defaultCategory="Workshop" />
        )}
      </div>
    </>
  )
}
