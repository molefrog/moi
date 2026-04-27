import type { ReactNode } from 'react'

import { motion } from 'motion/react'

type BottomPanelProps = {
  title: string
  children: ReactNode
}

export function BottomPanel({ title, children }: BottomPanelProps) {
  return (
    <motion.div
      className="bg-background absolute inset-x-[calc(var(--page-pad)*-1)] bottom-[calc(var(--page-pad)*-1)] z-20 flex max-h-[60vh] flex-col rounded-t-2xl p-[var(--page-pad)] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04),inset_0_2px_4px_-1px_rgba(0,0,0,0.06),inset_0_4px_16px_-4px_rgba(0,0,0,0.06)]"
      variants={{
        hidden: { opacity: 0, y: 40, filter: 'blur(4px)' },
        visible: { opacity: 1, y: 0, filter: 'blur(0px)' }
      }}
      initial="hidden"
      animate="visible"
      exit="hidden"
      transition={{ type: 'spring', duration: 0.25, bounce: 0 }}
    >
      <p className="text-muted-foreground mb-4 shrink-0 text-sm font-medium">{title}</p>
      <div className="-mx-[var(--page-pad)] flex-1 overflow-y-auto px-[var(--page-pad)]">
        {children}
      </div>
    </motion.div>
  )
}
