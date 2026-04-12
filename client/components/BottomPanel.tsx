import type { ReactNode } from 'react'

import { motion } from 'motion/react'

type BottomPanelProps = {
  title: string
  children: ReactNode
}

export function BottomPanel({ title, children }: BottomPanelProps) {
  return (
    <motion.div
      className="-mx-8 -mb-8 mt-8 rounded-t-2xl p-8 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04),inset_0_2px_4px_-1px_rgba(0,0,0,0.06),inset_0_4px_16px_-4px_rgba(0,0,0,0.06)]"
      variants={{
        hidden: { opacity: 0, y: 40, filter: 'blur(4px)' },
        visible: { opacity: 1, y: 0, filter: 'blur(0px)' }
      }}
      initial="hidden"
      animate="visible"
      exit="hidden"
      transition={{ type: 'spring', duration: 0.25, bounce: 0 }}
    >
      <p className="text-muted-foreground mb-4 text-sm font-medium">{title}</p>
      {children}
    </motion.div>
  )
}
