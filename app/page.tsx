import Image from 'next/image'
import Link from 'next/link'
import { Award, CalendarDays, Code2, GraduationCap, Medal, ShieldCheck, Trophy } from 'lucide-react'
import { EmptyState, SectionHeading } from '@/components/site/blocks'
import { site } from '@/lib/site'
import { getPublishedEvents } from '@/lib/events'
import { isSupabaseConfigured } from '@/lib/supabase/config'

const pillars = [
  { icon: GraduationCap, title: 'Workshops', text: 'Free and paid skill sessions led by practitioners, with schedules, capacity, and attendance tracking.', href: '/workshops' },
  { icon: Code2, title: 'Coding Competitions', text: 'Timed problem sets with secure, sandboxed judging and transparent scoring.', href: '/competitions' },
  { icon: Trophy, title: 'Leaderboards', text: 'Rankings computed from verified scores, with provisional and official results clearly separated.', href: '/leaderboard' },
  { icon: Award, title: 'Verified Certificates', text: 'Downloadable PDF certificates with a public verification page for employers and colleges.', href: '/verify-certificate' },
]

const steps = [
  { title: 'Create your account', text: 'Register once and receive a permanent participant ID such as UE-2026-000001.' },
  { title: 'Verify your email', text: 'Confirm ownership of your email to unlock registrations and certificates.' },
  { title: 'Register for events', text: 'Join workshops, webinars, quizzes, and competitions with the same account.' },
  { title: 'Compete and achieve', text: 'Submit solutions, climb the leaderboard, and earn verified certificates.' },
]

export default async function HomePage() {
  const { events, error } = await getPublishedEvents()

  return (
    <>
      <section className="relative isolate overflow-hidden bg-ink text-ink-foreground">
        <Image
          src="/images/hero-event.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="-z-10 object-cover opacity-35"
        />
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-r from-ink via-ink/85 to-ink/30" />
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 md:py-32">
          <p className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-gold">
            Events &middot; Workshops &middot; Competitions
          </p>
          <h1 className="mt-6 max-w-3xl text-5xl font-black leading-[1.05] tracking-tight md:text-7xl">
            {site.tagline.split('. ').slice(0, 3).join('. ')}.{' '}
            <span className="text-gold">Grow Worldwide.</span>
          </h1>
          <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-ink-foreground/75">
            One account for students, professionals, and colleges to learn new skills, attend workshops, and compete
            in coding challenges, with verified results and certificates.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              href="/sign-up"
              className="inline-flex h-12 items-center rounded-lg bg-gold px-6 text-sm font-semibold text-gold-foreground transition-colors hover:bg-gold/90"
            >
              Create Account
            </Link>
            <Link
              href="/events"
              className="inline-flex h-12 items-center rounded-lg border border-white/25 px-6 text-sm font-semibold text-ink-foreground transition-colors hover:bg-white/10"
            >
              Explore Events
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <SectionHeading eyebrow="What you can do" title="Everything in one platform" />
        <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {pillars.map(({ icon: Icon, title, text, href }) => (
            <li key={title}>
              <Link
                href={href}
                className="group flex h-full flex-col rounded-2xl border bg-card p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-gold hover:shadow-md"
              >
                <span className="flex size-11 items-center justify-center rounded-xl bg-ink text-gold">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-lg font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-y bg-muted/50">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2">
          <div>
            <SectionHeading eyebrow="Upcoming" title="Upcoming events" action={{ href: '/events', label: 'View all events' }} />
            {error ? (
              <p role="alert" className="mt-8 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                Event listings are unavailable because the connected database schema needs to be checked.
              </p>
            ) : events.length === 0 ? (
              <EmptyState
                className="mt-8"
                icon={CalendarDays}
                title="No published events yet"
                description={isSupabaseConfigured()
                  ? 'Events created and published by administrators will appear here.'
                  : 'Published event listings will appear here after the platform database is configured.'}
              />
            ) : (
              <ul className="mt-8 grid gap-3">
                {events.slice(0, 3).map((event) => (
                  <li key={event.id}>
                    <Link href={`/events/${event.id}`} className="group block rounded-2xl border bg-card p-5 transition-colors hover:border-gold">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold">{event.category}</span>
                        <span className="text-sm font-bold">{Number(event.price) === 0 ? 'Free' : `₹${Number(event.price).toFixed(2)}`}</span>
                      </div>
                      <h3 className="mt-3 font-bold group-hover:text-foreground">{event.title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {event.event_date
                          ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(event.event_date))
                          : 'Date to be announced'}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <SectionHeading eyebrow="Results" title="Recent winners" action={{ href: '/winners', label: 'All winners' }} />
            <EmptyState
              className="mt-8"
              icon={Medal}
              title="No official results published"
              description="Winners appear only after an administrator reviews and publishes official competition results."
            />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <SectionHeading eyebrow="How it works" title="From sign-up to certificate" />
        <ol className="mt-10 grid gap-5 md:grid-cols-4">
          {steps.map((step, i) => (
            <li key={step.title} className="relative rounded-2xl border bg-card p-6">
              <span className="font-heading text-4xl font-black text-gold">{String(i + 1).padStart(2, '0')}</span>
              <h3 className="mt-3 text-lg font-bold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="px-4 pb-20 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 rounded-3xl bg-ink p-8 text-ink-foreground md:flex-row md:items-center md:p-12">
          <div className="flex items-start gap-4">
            <ShieldCheck className="mt-1 size-8 shrink-0 text-gold" aria-hidden="true" />
            <div>
              <h2 className="text-2xl font-extrabold md:text-3xl">Have a certificate to check?</h2>
              <p className="mt-2 max-w-xl text-ink-foreground/70">
                Verify any ULTIMATE EVENTS certificate by its unique ID without exposing personal details.
              </p>
            </div>
          </div>
          <Link
            href="/verify-certificate"
            className="inline-flex h-12 shrink-0 items-center rounded-lg bg-gold px-6 text-sm font-semibold text-gold-foreground hover:bg-gold/90"
          >
            Verify a certificate
          </Link>
        </div>
      </section>
    </>
  )
}
