import type { Metadata } from 'next'
import { Trophy } from 'lucide-react'
import { EmptyState, PageHeader, SetupNotice } from '@/components/site/blocks'

export const metadata: Metadata = { title: 'Leaderboard' }

const columns = ['Rank', 'Participant', 'Competition', 'Score', 'Submission', 'Result status']

export default function LeaderboardPage() {
  return (
    <>
      <PageHeader
        eyebrow="Leaderboard"
        title="Rankings from verified scores"
        description="Provisional rankings update as scores are verified. Official results are marked once an administrator publishes them."
      />
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-12 sm:px-6">
        <SetupNotice feature="The leaderboard" />
        <div className="overflow-x-auto rounded-2xl border bg-card">
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
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
