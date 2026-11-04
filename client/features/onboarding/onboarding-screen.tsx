import type { ReactNode } from 'react'
import { cn } from '@/client/lib/cn'

type OnboardingScreenProps = {
  children: ReactNode
  className: string
  footer?: ReactNode
}

// Shared spacing and centering only. Each screen chooses its own width.
export function OnboardingScreen({ children, className, footer }: OnboardingScreenProps) {
  return (
    <div className="grid flex-1 grid-rows-[1fr_auto_1fr] p-6">
      <div className={cn('row-start-2 mx-auto flex w-full flex-col gap-6 py-8', className)}>
        {children}
      </div>
      <div className="row-start-3 flex min-h-9 items-end justify-center">{footer}</div>
    </div>
  )
}
