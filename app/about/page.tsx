import type { Metadata } from 'next'
import { PageHeader } from '@/components/site/blocks'

export const metadata: Metadata = { title: 'About Us' }

const values = [
  { title: 'Open to everyone', text: 'Students, professionals, colleges, and lifelong learners all use the same account and participant ID.' },
  { title: 'Fair by design', text: 'Scores, rankings, payments, and certificates are verified on the server, never trusted from the browser.' },
  { title: 'Privacy first', text: 'We collect only what events require and never expose passwords or unnecessary personal information.' },
]

export default function AboutPage() {
  return (
    <>
      <PageHeader
        eyebrow="About Us"
        title="Built for people who want to grow"
        description="ULTIMATE EVENTS brings workshops, competitions, and verified achievements together so participants can focus on learning and competing."
      />
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <ul className="grid gap-5 md:grid-cols-3">
          {values.map((v) => (
            <li key={v.title} className="rounded-2xl border bg-card p-6">
              <span aria-hidden="true" className="block h-1 w-10 rounded-full bg-gold" />
              <h2 className="mt-5 text-xl font-bold">{v.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{v.text}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
