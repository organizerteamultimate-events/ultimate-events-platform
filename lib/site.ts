export const site = {
  name: 'ULTIMATE EVENTS',
  tagline: 'Explore Skills. Compete. Achieve. Grow Worldwide.',
}

export const mainNav = [
  { href: '/', label: 'Home' },
  { href: '/events', label: 'Explore Events' },
  { href: '/workshops', label: 'Workshops' },
  { href: '/competitions', label: 'Coding Competitions' },
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/winners', label: 'Winners' },
  { href: '/about', label: 'About Us' },
  { href: '/contact', label: 'Contact Us' },
]

export const eventCategories = [
  'Workshop',
  'Webinar',
  'Quiz',
  'Coding Competition',
  'Technical Event',
  'Skill Development',
]

export type SetupItem = {
  name: string
  purpose: string
  requires: string
}

export const setupChecklist: SetupItem[] = [
  {
    name: 'Supabase project',
    purpose: 'Provides managed PostgreSQL storage and secure authentication for accounts, profiles, and participant IDs.',
    requires: 'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local, then apply the profile migration.',
  },
  {
    name: 'Email provider',
    purpose: 'Email verification, password reset, confirmations, reminders, and announcements.',
    requires: 'Supabase Auth SMTP settings and server-side SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_APP_PASSWORD, and EMAIL_FROM.',
  },
  {
    name: 'Manual UPI payments',
    purpose: 'UPI transaction references remain pending until an administrator verifies the transfer.',
    requires: 'Apply the participant workflows migration, then set the organization UPI ID and instructions in Admin → Settings; no payment gateway is connected.',
  },
  {
    name: 'Code judging service',
    purpose: 'Sandboxed execution and scoring of competition submissions off the main server.',
    requires: 'An external judging service endpoint and API credentials.',
  },
  {
    name: 'Admin bootstrap',
    purpose: 'Grants the first administrator through a secure, documented process.',
    requires: 'Create and verify an account, then promote its auth user UUID to admin using the owner-only SQL in SUPABASE_SETUP.md.',
  },
]
