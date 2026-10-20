import Image from 'next/image'
import Link from 'next/link'
import { SetupNotice } from './blocks'
import { isSupabaseConfigured } from '@/lib/supabase/config'

export function AuthShell({
  title,
  description,
  feature,
  wide,
  children,
}: {
  title: string
  description: string
  feature: string
  wide?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="bg-muted/50 px-4 py-12 sm:px-6 md:py-20">
      <div className={wide ? 'mx-auto max-w-2xl' : 'mx-auto max-w-md'}>
        <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          <Link
            href="/"
            aria-label="ULTIMATE EVENTS home"
            className="mx-auto mb-6 flex size-32 items-center justify-center rounded-2xl bg-ink p-2"
          >
            <Image
              src="/images/ultimate-events-logo.png"
              alt="ULTIMATE EVENTS — Learn, Compete, Grow"
              width={768}
              height={768}
              loading="eager"
              className="size-full object-contain"
            />
          </Link>
          <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">{title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
          {!isSupabaseConfigured() && <SetupNotice feature={feature} className="mt-6" />}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  )
}
