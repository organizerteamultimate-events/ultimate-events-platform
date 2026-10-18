import type { Metadata } from 'next'
import { Medal } from 'lucide-react'
import { EmptyState, PageHeader, SetupNotice } from '@/components/site/blocks'

export const metadata: Metadata = { title: 'Winners' }

const podium = [
  { place: '1st place', ring: 'border-gold bg-gold/10', label: 'Gold' },
  { place: '2nd place', ring: 'border-zinc-400 bg-zinc-100', label: 'Silver' },
  { place: '3rd place', ring: 'border-amber-700/60 bg-amber-700/10', label: 'Bronze' },
]

export default function WinnersPage() {
  return (
    <>
      <PageHeader
        eyebrow="Winners"
        title="Official results"
        description="Only results reviewed and published by an authorized administrator are shown here."
      />
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-12 sm:px-6">
        <SetupNotice feature="Results publication" />
        <ul className="grid gap-5 md:grid-cols-3" aria-label="Podium">
          {podium.map((p) => (
            <li key={p.place} className={`rounded-2xl border-2 p-6 ${p.ring}`}>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{p.label}</p>
              <p className="mt-1 font-heading text-2xl font-extrabold">{p.place}</p>
              <p className="mt-4 text-sm text-muted-foreground">Awaiting published results</p>
            </li>
          ))}
        </ul>
        <EmptyState
          icon={Medal}
          title="No winners published yet"
          description="When official competition results are published, winners will be listed here by competition."
        />
      </div>
    </>
  )
}
