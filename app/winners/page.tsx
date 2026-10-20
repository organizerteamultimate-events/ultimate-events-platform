import type { Metadata } from 'next'
import { Medal } from 'lucide-react'
import { EmptyState, PageHeader, SetupNotice } from '@/components/site/blocks'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/supabase/config'

export const metadata: Metadata = { title: 'Winners' }
type PublishedWinner = {
  event_id: string
  event_name: string
  participant_name: string
  participant_id: string
  place: number
  award_title: string
}

export default async function WinnersPage() {
  const supabase = await createSupabaseServerClient()
  const { data: winners, error } = supabase
    ? await supabase.rpc('get_published_winners')
    : { data: null, error: new Error('Supabase is not configured.') }
  return (
    <>
      <PageHeader
        eyebrow="Winners"
        title="Official results"
        description="Only results reviewed and published by an authorized administrator are shown here."
      />
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-12 sm:px-6">
        {!isSupabaseConfigured() ? <SetupNotice feature="Results publication" /> : error ? (
          <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">Published results could not be loaded. Apply the participant workflows migration and check the database policies.</p>
        ) : winners?.length ? (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {winners.map((winner: PublishedWinner) => (
              <li key={`${winner.event_id}-${winner.place}`} className="rounded-2xl border bg-card p-6 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{winner.event_name}</p>
                <p className="mt-3 font-heading text-2xl font-extrabold">{winner.award_title}</p>
                <p className="mt-2 text-lg font-semibold">{winner.participant_name}</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">{winner.participant_id} · Place {winner.place}</p>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={Medal} title="No winners published yet" description="When an authorized administrator publishes verified results, they will appear here." />
        )}
      </div>
    </>
  )
}
