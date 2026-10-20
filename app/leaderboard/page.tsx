import type { Metadata } from 'next'
import { Trophy } from 'lucide-react'
import { EmptyState, PageHeader, SetupNotice } from '@/components/site/blocks'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/supabase/config'

export const metadata: Metadata = { title: 'Leaderboard' }

const columns = ['Rank', 'Participant', 'Competition', 'Score', 'Award']
type PublishedWinner = {
  event_id: string
  event_name: string
  participant_name: string
  participant_id: string
  place: number
  award_title: string
  score: number | null
}

export default async function LeaderboardPage() {
  const supabase = await createSupabaseServerClient()
  const { data: results, error } = supabase
    ? await supabase.rpc('get_published_winners')
    : { data: null, error: new Error('Supabase is not configured.') }
  return (
    <>
      <PageHeader
        eyebrow="Leaderboard"
        title="Rankings from verified scores"
        description="Provisional rankings update as scores are verified. Official results are marked once an administrator publishes them."
      />
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-12 sm:px-6">
        {!isSupabaseConfigured() ? <SetupNotice feature="The leaderboard" /> : error ? (
          <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">Published rankings could not be loaded. Apply the participant workflows migration and check database policies.</p>
        ) : <div className="overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full min-w-[640px] text-left text-sm">
            <caption className="sr-only">Competition leaderboard</caption>
            <thead className="bg-ink text-ink-foreground">
              <tr>
                {columns.map((c) => (
                  <th key={c} scope="col" className="px-4 py-3 font-semibold">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results?.length ? results.map((result: PublishedWinner) => (
                <tr key={`${result.event_id}-${result.place}`}>
                  <td className="px-4 py-3">{result.place}</td>
                  <td className="px-4 py-3">{result.participant_name}<br /><span className="font-mono text-xs text-muted-foreground">{result.participant_id}</span></td>
                  <td className="px-4 py-3">{result.event_name}</td>
                  <td className="px-4 py-3">{result.score ?? '—'}</td>
                  <td className="px-4 py-3">{result.award_title}</td>
                </tr>
              )) : (
              <tr>
                <td colSpan={columns.length} className="p-4">
                  <EmptyState
                    className="border-none"
                    icon={Trophy}
                    title="No scores recorded"
                    description="Rankings appear only from real, verified competition scores. No participants or scores are invented."
                  />
                </td>
              </tr>
              )}
            </tbody>
          </table>
        </div>}
      </div>
    </>
  )
}
