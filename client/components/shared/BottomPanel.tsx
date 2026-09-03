import type { ReactNode, Ref } from 'react'

import { motion } from 'motion/react'

import { IconX } from '@tabler/icons-react'

import { Button } from '@/client/components/ui/button'
import { cn } from '@/client/lib/cn'

type BottomPanelProps = {
  actions?: ReactNode
  className?: string
  title: string
  children: ReactNode
  onClose: () => void
  // Forwarded to the panel element so the working area can measure its height
  // and reserve matching space below the grid.
  ref?: Ref<HTMLDivElement>
}

export function BottomPanel({
  actions,
  className,
  title,
  children,
  onClose,
  ref
}: BottomPanelProps) {
  return (
    <motion.div
      ref={ref}
      className={cn(
        'absolute inset-x-4 bottom-4 no-scrollbar flex max-h-full flex-col gap-4 overflow-y-auto rounded-2xl bg-card text-card-foreground shadow-md',
        'mx-auto max-w-[calc(var(--chat-max-container)+var(--page-pad)*2)] p-(--page-pad) pb-0',
        className
      )}
      variants={{
        hidden: { opacity: 0, y: 40, filter: 'blur(4px)' },
        visible: { opacity: 1, y: 0, filter: 'blur(0px)' }
      }}
      initial="hidden"
      animate="visible"
      exit="hidden"
      transition={{ type: 'spring', duration: 0.25, bounce: 0 }}
    >
      <div className="flex shrink-0 items-center justify-between gap-4">
        <p className="text-sm font-medium">{title}</p>
        <div className="flex items-center gap-2">
          {actions}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close panel"
          >
            <IconX stroke={1.75} />
          </Button>
        </div>
      </div>
      <div className="flex-1 pb-(--page-pad)">{children}</div>
    </motion.div>
  )
}
