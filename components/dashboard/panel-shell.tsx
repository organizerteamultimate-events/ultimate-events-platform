'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  Activity,
  Award,
  Bell,
  BookOpen,
  CalendarDays,
  ClipboardList,
  CreditCard,
  FileBarChart,
  FileText,
  LayoutDashboard,
  LogIn,
  LogOut,
  Mail,
  Medal,
  Settings,
  Shield,
  Trophy,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { Logo } from '@/components/site/logo'
import { cn } from '@/lib/utils'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { isSupabaseConfigured } from '@/lib/supabase/config'

type PanelKind = 'user' | 'admin'

type PanelLink = {
  label: string
  href: string
  icon: LucideIcon
}

const userLinks: PanelLink[] = [
  { label: 'Overview', href: '/dashboard', icon: LayoutDashboard },
  { label: 'My profile', href: '/dashboard/profile', icon: UserRound },
  { label: 'My events', href: '/dashboard/events', icon: CalendarDays },
  { label: 'My workshops', href: '/dashboard/workshops', icon: BookOpen },
  { label: 'Registrations', href: '/dashboard/registrations', icon: ClipboardList },
  { label: 'Payments', href: '/dashboard/payments', icon: CreditCard },
  { label: 'Competitions', href: '/dashboard/competitions', icon: Trophy },
  { label: 'Submissions & results', href: '/dashboard/results', icon: Activity },
  { label: 'Certificates', href: '/dashboard/certificates', icon: Award },
  { label: 'Notifications', href: '/dashboard/notifications', icon: Bell },
  { label: 'Help & support', href: '/dashboard/support', icon: Mail },
]

const adminLinks: PanelLink[] = [
  { label: 'Overview', href: '/admin', icon: LayoutDashboard },
  { label: 'Users', href: '/admin/users', icon: Users },
  { label: 'Events & workshops', href: '/admin/events', icon: CalendarDays },
  { label: 'Registrations', href: '/admin/registrations', icon: ClipboardList },
  { label: 'Payments', href: '/admin/payments', icon: CreditCard },
  { label: 'Competitions', href: '/admin/competitions', icon: Trophy },
  { label: 'Submissions', href: '/admin/submissions', icon: Activity },
  { label: 'Leaderboard', href: '/admin/leaderboard', icon: Medal },
  { label: 'Winners', href: '/admin/winners', icon: Award },
  { label: 'Certificates', href: '/admin/certificates', icon: FileText },
  { label: 'Announcements', href: '/admin/announcements', icon: Mail },
  { label: 'Reports', href: '/admin/reports', icon: FileBarChart },
  { label: 'Audit logs', href: '/admin/audit-logs', icon: Shield },
  { label: 'Settings', href: '/admin/settings', icon: Settings },
]

export function PanelShell({
  kind,
  children,
}: {
  kind: PanelKind
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [signOutError, setSignOutError] = useState<string | null>(null)
  const [signingOut, setSigningOut] = useState(false)
  const isAdmin = kind === 'admin'
  const supabaseConfigured = isSupabaseConfigured()
  const links = isAdmin ? adminLinks : userLinks
  const title = isAdmin ? 'Admin workspace' : 'Participant space'
  const currentLink = links.find(({ href }) => href === pathname)

  async function signOut() {
    setSignOutError(null)
    const supabase = createSupabaseBrowserClient()
    if (!supabase) {
      setSignOutError('Supabase is not configured, so there is no active session to sign out.')
      return
    }
    setSigningOut(true)
    try {
      const { error } = await supabase.auth.signOut()
      if (error) {
        setSignOutError(`Could not sign out: ${error.message}`)
        return
      }
      router.replace(isAdmin ? '/admin/login' : '/login')
      router.refresh()
    } catch (error) {
      setSignOutError(`Could not sign out: ${error instanceof Error ? error.message : 'Unexpected connection error.'}`)
    } finally {
      setSigningOut(false)
    }
  }

  const linkList = (mobile = false) => (
    <nav aria-label={`${isAdmin ? 'Admin' : 'User'} dashboard`} className={mobile ? 'w-full' : undefined}>
      <ul className={cn('flex gap-1', mobile ? 'w-max' : 'flex-col')}>
        {links.map(({ label, href, icon: Icon }) => {
          const active = href === (isAdmin ? '/admin' : '/dashboard')
            ? pathname === href
            : pathname.startsWith(href)

          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-lg text-sm font-medium transition-colors',
                  mobile ? 'px-3 py-2.5' : 'px-3 py-2.5',
                  active
                    ? 'bg-gold text-gold-foreground'
                    : 'text-ink-foreground/70 hover:bg-white/10 hover:text-ink-foreground',
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span className="whitespace-nowrap">{label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )

  return (
    <div className="min-h-dvh bg-muted/40">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-ink px-4 pb-5 pt-5 text-ink-foreground lg:flex">
        <Logo className="px-2" />
        <p className="mb-4 mt-9 px-3 text-xs font-semibold uppercase tracking-[0.16em] text-ink-foreground/45">
          {title}
        </p>
        <div className="min-h-0 flex-1 overflow-y-auto">{linkList()}</div>
        <div className="mt-4 border-t border-white/10 pt-4">
          {supabaseConfigured ? (
            <button
              type="button"
              onClick={signOut}
              disabled={signingOut}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-ink-foreground/70 transition-colors hover:bg-white/10 hover:text-ink-foreground"
            >
              <LogOut className="size-4" aria-hidden="true" />
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          ) : (
            <Link
              href={isAdmin ? '/admin/login' : '/login'}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink-foreground/70 transition-colors hover:bg-white/10 hover:text-ink-foreground"
            >
              <LogIn className="size-4" aria-hidden="true" />
              Sign in
            </Link>
          )}
          <Link href="/" className="mt-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-ink-foreground/55 transition-colors hover:text-ink-foreground">
            Back to website
          </Link>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <Logo compact className="lg:hidden" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">{title}</p>
                <p className="hidden text-xs text-muted-foreground sm:block">
                  {isAdmin ? 'Manage the ULTIMATE EVENTS platform' : 'Your learning and event activity'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/" className="hidden text-sm font-medium text-muted-foreground hover:text-foreground sm:block">
                Visit website
              </Link>
              <span className="flex size-9 items-center justify-center rounded-full bg-ink text-sm font-bold text-gold" aria-hidden="true">
                {isAdmin ? 'A' : 'U'}
              </span>
              <span className="hidden text-sm font-medium sm:block">{isAdmin ? 'Administrator' : 'Participant'}</span>
            </div>
          </div>
        </header>
        {signOutError && (
          <p role="alert" className="mx-4 mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive sm:mx-6">
            {signOutError}
          </p>
        )}

        <div className="border-b bg-card px-4 py-3 lg:hidden sm:px-6">
          <div className="mx-auto flex max-w-[1600px] items-center gap-3">
            <label htmlFor="panel-navigation" className="shrink-0 text-sm font-medium">
              Go to
            </label>
            <select
              id="panel-navigation"
              value={currentLink?.href ?? (isAdmin ? '/admin' : '/dashboard')}
              onChange={(event) => router.push(event.target.value)}
              className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm font-medium text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
            >
              {links.map(({ label, href }) => (
                <option key={href} value={href}>
                  {label}
                </option>
              ))}
            </select>
            {supabaseConfigured && (
              <button
                type="button"
                onClick={signOut}
                disabled={signingOut}
                className="shrink-0 rounded-lg border px-3 py-2.5 text-sm font-medium disabled:opacity-60"
              >
                {signingOut ? 'Signing out…' : 'Sign out'}
              </button>
            )}
            <Link
              href="/"
              className="shrink-0 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Website
            </Link>
          </div>
        </div>
        <main className="mx-auto max-w-[1600px] px-4 py-7 sm:px-6 sm:py-9">{children}</main>
      </div>
    </div>
  )
}

export function PanelAccessNotice({ admin = false }: { admin?: boolean }) {
  const configured = isSupabaseConfigured()
  return (
    <div role="status" className="mb-7 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3.5 text-sm text-amber-950">
      <Shield className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div>
        <p className="font-semibold">
          {admin
            ? configured
              ? 'Supabase Auth and role-based admin access checks are enabled.'
              : 'Admin workspace preview — not access-controlled yet.'
            : configured
              ? 'Supabase Auth and participant profiles are enabled.'
              : 'Account services are not connected yet.'}
        </p>
        <p className="mt-1 leading-relaxed text-amber-900/85">
          {admin
            ? configured
              ? 'Apply the ordered Supabase migrations to enable event, payment, participant, result, and certificate workflows. SMTP settings are required for email delivery.'
              : 'Database, server-side admin authorization, and management actions must be configured before this workspace can handle real records. Do not use it with production data.'
            : configured
              ? 'Your registrations, payments, submissions, results, notifications, and eligible certificates are loaded from your account records.'
              : 'Authentication and the database are awaiting configuration. Your profile, participant ID, registrations, and activity are not being loaded or saved yet.'}{' '}
          <Link href="/setup" className="font-semibold underline underline-offset-2">
            View setup requirements
          </Link>
        </p>
      </div>
    </div>
  )
}

export function PanelPageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string
  title: string
  description: string
  action?: { href: string; label: string }
}) {
  return (
    <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">{description}</p>
      </div>
      {action && (
        <Link href={action.href} className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-gold px-4 text-sm font-semibold text-gold-foreground transition-colors hover:bg-gold/90">
          {action.label}
        </Link>
      )}
    </div>
  )
}

const statIcons = {
  activity: Activity,
  award: Award,
  book: BookOpen,
  calendar: CalendarDays,
  clipboard: ClipboardList,
  credit: CreditCard,
  users: Users,
  trophy: Trophy,
}

export function PanelStat({
  label,
  value = '—',
  detail = 'Available when connected',
  icon,
}: {
  label: string
  value?: string
  detail?: string
  icon: keyof typeof statIcons
}) {
  const Icon = statIcons[icon]
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-extrabold tracking-tight">{value}</p>
        </div>
        <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-foreground">
          <Icon className="size-5" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}
