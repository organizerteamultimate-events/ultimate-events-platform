
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
    purpose:
      'Provides managed PostgreSQL storage and secure authentication for accounts, profiles, and participant IDs.',
    requires:
      'Supabase URL and publishable key must be configured. Existing database schema and migrations should be verified; do not reapply completed migrations.',
  },
  {
    name: 'Email provider',
    purpose:
      'Supports email verification, password reset, confirmations, reminders, and announcements.',
    requires:
      'Configure Supabase Auth SMTP settings and server-side SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_APP_PASSWORD, and EMAIL_FROM. Credentials alone do not confirm successful email delivery.',
  },
  {
    name: 'Manual UPI payments',
    purpose:
      'Participants submit their UPI transaction reference and payment receipt. Payments remain pending until an administrator verifies them.',
    requires:
      'Configure the organization UPI ID and payment instructions in Admin → Settings. No external payment gateway is connected.',
  },
  {
    name: 'Code judging service',
    purpose:
      'Supports sandboxed execution and scoring of competition submissions outside the main application server.',
    requires:
      'Optional integration: configure an external judging service endpoint and API credentials before enabling automated code judging.',
  },
  {
    name: 'Admin access',
    purpose:
      'Allows authorized administrators to manage events, registrations, payment reviews, participants, and platform settings.',
    requires:
      'Verify that the existing administrator account has the admin role and can access the Admin Dashboard. Do not create another admin or repeat the bootstrap process.',
  },
]
