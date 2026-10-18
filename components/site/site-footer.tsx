import Link from 'next/link'
import { Logo } from './logo'
import { site } from '@/lib/site'

const groups = [
  {
    title: 'Explore',
    links: [
      { href: '/events', label: 'Explore Events' },
      { href: '/workshops', label: 'Workshops' },
      { href: '/competitions', label: 'Coding Competitions' },
      { href: '/leaderboard', label: 'Leaderboard' },
      { href: '/winners', label: 'Winners' },
    ],
  },
  {
    title: 'Account',
    links: [
      { href: '/sign-up', label: 'Create Account' },
      { href: '/login', label: 'Login' },
      { href: '/forgot-password', label: 'Forgot Password' },
      { href: '/verify-certificate', label: 'Verify a Certificate' },
      { href: '/admin/login', label: 'Admin Login' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/about', label: 'About Us' },
      { href: '/contact', label: 'Contact Us' },
      { href: '/privacy', label: 'Privacy Policy' },
      { href: '/terms', label: 'Terms of Service' },
      { href: '/setup', label: 'Platform Status' },
    ],
  },
]

export function SiteFooter() {
  return (
    <footer className="bg-ink text-ink-foreground">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="flex flex-col gap-4">
          <Logo />
          <p className="max-w-xs text-sm leading-relaxed text-ink-foreground/65">{site.tagline}</p>
        </div>
        {groups.map((group) => (
          <div key={group.title}>
            <h2 className="font-heading text-sm font-semibold uppercase tracking-wider text-gold">
              {group.title}
            </h2>
            <ul className="mt-4 flex flex-col gap-2.5">
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-ink-foreground/70 transition-colors hover:text-ink-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-7xl px-4 py-6 text-xs text-ink-foreground/55 sm:px-6">
          {'© '}
          {new Date().getFullYear()} {site.name}. All rights reserved.
        </p>
      </div>
    </footer>
  )
}
