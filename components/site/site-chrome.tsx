'use client'

import { usePathname } from 'next/navigation'
import { SiteFooter } from './site-footer'
import { SiteHeader } from './site-header'

export function SiteChrome({ placement }: { placement: 'header' | 'footer' }) {
  const pathname = usePathname()
  const isPanel = pathname.startsWith('/dashboard') || pathname.startsWith('/admin')

  if (isPanel) return null

  return placement === 'header' ? <SiteHeader /> : <SiteFooter />
}
