import Link from 'next/link'
import { cn } from '@/lib/utils'

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn('group inline-flex items-center gap-2.5 rounded-md', className)}
      aria-label="ULTIMATE EVENTS home"
    >
      <span
        aria-hidden="true"
        className="flex size-9 items-center justify-center rounded-lg bg-gold font-heading text-sm font-black tracking-tight text-gold-foreground transition-transform group-hover:-rotate-3"
      >
        UE
      </span>
      <span className="flex flex-col leading-none">
        <span className="font-heading text-base font-extrabold tracking-wide">
          ULTIMATE <span className="text-gold">EVENTS</span>
        </span>
      </span>
    </Link>
  )
}
