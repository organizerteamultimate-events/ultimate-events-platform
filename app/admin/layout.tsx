import type { Metadata } from 'next'
import { AdminPanelLayout } from '@/components/dashboard/panel-layouts'

export const metadata: Metadata = {
  title: 'Admin Dashboard',
  robots: { index: false },
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminPanelLayout>{children}</AdminPanelLayout>
}
