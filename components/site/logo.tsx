import Link from 'next/link'
import Image from 'next/image'
import { cn } from '@/lib/utils'

export function Logo({
  className,
  compact = false,
}: {
  className?: string
  compact?: boolean
}) {
  return (
    <Link
      href="/"
      className={cn('group inline-flex items-center gap-2.5 rounded-md', className)}
      aria-label="ULTIMATE EVENTS home"
    >
      <Image
        src="/images/ultimate-events-logo.png"
        alt=""
        width={768}
        height={768}
        loading={compact ? 'eager' : 'lazy'}
        className={cn(
          'size-12 shrink-0 object-contain transition-transform group-hover:scale-[1.03]',
          compact && 'size-10 sm:size-14',
        )}
      />
      <span className={cn('flex flex-col leading-none', compact && 'hidden sm:flex')}>
        <span className="font-heading text-base font-extrabold tracking-wide">
          ULTIMATE <span className="text-gold">EVENTS</span>
        </span>
        <span className="mt-1 text-[0.6rem] font-medium uppercase tracking-[0.18em] text-ink-foreground/65">
          Learn · Compete · Grow
        </span>
      </span>
    </Link>
  )
}
