'use client'

import { usePathname } from 'next/navigation'
import { PanelShell } from './panel-shell'

export function UserPanelLayout({ children }: { children: React.ReactNode }) {
  return <PanelShell kind="user">{children}</PanelShell>
}

export function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  if (pathname === '/admin/login') return <>{children}</>
  return <PanelShell kind="admin">{children}</PanelShell>
}
