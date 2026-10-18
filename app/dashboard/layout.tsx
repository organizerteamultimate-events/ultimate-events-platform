import type { Metadata } from 'next'
import { UserPanelLayout } from '@/components/dashboard/panel-layouts'

export const metadata: Metadata = {
  title: 'Participant Dashboard',
  robots: { index: false },
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <UserPanelLayout>{children}</UserPanelLayout>
}
