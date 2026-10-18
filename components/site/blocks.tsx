import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

export function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string
  title: string
  description?: string
  children?: React.ReactNode
}) {
  return (
    <section className="border-b border-white/10 bg-ink text-ink-foreground">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 md:py-20">
        {eyebrow && (
          <p className="text-sm font-semibold uppercase tracking-widest text-gold">{eyebrow}</p>
        )}
        <h1 className="mt-3 max-w-3xl text-4xl font-extrabold tracking-tight md:text-5xl">{title}</h1>
        {description && (
          <p className="mt-4 max-w-2xl text-pretty text-base leading-relaxed text-ink-foreground/70 md:text-lg">
            {description}
          </p>
        )}
        {children}
      </div>
    </section>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon
  title: string
  description: string
  action?: { href: string; label: string }
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-dashed bg-card px-6 py-14 text-center',
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-accent text-foreground">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <h3 className="mt-4 text-lg font-bold">{title}</h3>
      <p className="mt-2 max-w-md text-pretty text-sm leading-relaxed text-muted-foreground">{description}</p>
      {action && (
        <Link
          href={action.href}
          className="mt-6 inline-flex h-10 items-center rounded-lg border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
        >
          {action.label}
        </Link>
      )}
    </div>
  )
}

export function SetupNotice({ feature, className }: { feature: string; className?: string }) {
  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-3 rounded-xl border border-gold/50 bg-accent px-4 py-3 text-sm text-accent-foreground',
        className,
      )}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p className="leading-relaxed">
        <span className="font-semibold">{feature} is awaiting configuration.</span>{' '}
        No backend database or service is connected yet, so nothing on this page is saved or processed.{' '}
        <Link href="/setup" className="font-medium underline underline-offset-4">
          View platform status
        </Link>
      </p>
    </div>
  )
}

export function SectionHeading({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string
  title: string
  action?: { href: string; label: string }
}) {
  return (
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">{eyebrow}</p>
        <h2 className="mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">{title}</h2>
      </div>
      {action && (
        <Link href={action.href} className="text-sm font-semibold underline-offset-4 hover:underline">
          {action.label}
        </Link>
      )}
    </div>
  )
}
