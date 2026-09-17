import type { ReactNode } from 'react'

import { cn } from '@/client/lib/cn'

// Muted text with a brighter band sweeping left→right — an "is working" cue.
// The text is clipped to a 200%-wide gradient whose highlight sits at the
// centre; the `text-shimmer` keyframe (client/index.css) slides it across. When
// `active` is false it renders as plain inherited-colour text.
const SHIMMER = cn(
  'animate-[text-shimmer_2s_ease-in-out_infinite]',
  'bg-clip-text text-transparent',
  'bg-[length:200%_auto]',
  'bg-[linear-gradient(90deg,var(--muted-foreground)_0%,var(--muted-foreground)_40%,var(--foreground)_50%,var(--muted-foreground)_60%,var(--muted-foreground)_100%)]'
)

type ShimmerTextProps = { children: ReactNode; active?: boolean; className?: string }

export function ShimmerText({ children, active = true, className }: ShimmerTextProps) {
  return <span className={cn(className, active && SHIMMER)}>{children}</span>
}
