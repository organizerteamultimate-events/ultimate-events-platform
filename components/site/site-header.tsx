'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { ChevronDown, Menu, X } from 'lucide-react'
import { Logo } from './logo'
import { mainNav } from '@/lib/site'
import { cn } from '@/lib/utils'

export function SiteHeader() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const primaryNav = mainNav.slice(0, 5)
  const moreNav = [
    ...mainNav.slice(5),
    { href: '/admin/login', label: 'Admin Login' },
  ]

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href))

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-ink text-ink-foreground">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />

        <nav aria-label="Main" className="hidden flex-1 justify-center xl:flex">
          <ul className="flex items-center gap-0.5">
            {primaryNav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive(item.href) ? 'page' : undefined}
                  className={cn(
                    'whitespace-nowrap rounded-md px-2.5 py-2 text-sm text-ink-foreground/75 transition-colors hover:text-ink-foreground',
                    isActive(item.href) && 'text-gold hover:text-gold',
                  )}
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li className="relative">
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-1 rounded-md px-2.5 py-2 text-sm text-ink-foreground/75 transition-colors hover:text-ink-foreground [&::-webkit-details-marker]:hidden">
                  More
                  <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <ul className="absolute right-0 top-full z-50 mt-2 min-w-48 rounded-xl border border-white/10 bg-ink p-2 shadow-xl">
                  {moreNav.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={isActive(item.href) ? 'page' : undefined}
                        className={cn(
                          'block rounded-lg px-3 py-2.5 text-sm text-ink-foreground/75 transition-colors hover:bg-white/10 hover:text-ink-foreground',
                          isActive(item.href) && 'text-gold',
                        )}
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="hidden rounded-lg px-2.5 py-2 text-sm font-medium text-ink-foreground/85 transition-colors hover:text-ink-foreground sm:inline-flex"
          >
            Login
          </Link>
          <Link
            href="/sign-up"
            className="inline-flex h-9 shrink-0 items-center rounded-lg bg-gold px-3.5 text-sm font-semibold text-gold-foreground transition-colors hover:bg-gold/90 sm:px-4"
          >
            Create Account
          </Link>
          <button
            type="button"
            className="inline-flex size-9 items-center justify-center rounded-lg text-ink-foreground hover:bg-white/10 xl:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
            <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
          </button>
        </div>
      </div>

      {open && (
        <nav id="mobile-nav" aria-label="Mobile" className="border-t border-white/10 xl:hidden">
          <ul className="mx-auto grid max-w-7xl gap-1 px-4 py-3 sm:grid-cols-2 sm:px-6">
            {[...mainNav, { href: '/login', label: 'Login' }, { href: '/admin/login', label: 'Admin Login' }].map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={isActive(item.href) ? 'page' : undefined}
                  className={cn(
                    'block rounded-md px-3 py-2.5 text-sm text-ink-foreground/80 hover:bg-white/5 hover:text-ink-foreground',
                    isActive(item.href) && 'text-gold',
                  )}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  )
}
