import type { ReactNode } from 'react'

import { AnimatePresence, motion } from 'motion/react'

type CollapseProps = { open: boolean; children: ReactNode }

// Height auto-animation — the same spring as the meta-ficus FAQ accordion
// (height 0 ↔ auto, opacity, overflow-hidden). The body is mounted only while
// open (AnimatePresence), so heavy children (highlighted code) neither render
// nor tokenize until expanded — and unmount again on collapse.
export function Collapse({ open, children }: CollapseProps) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="content"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ type: 'spring', duration: 0.25, bounce: 0.1 }}
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
