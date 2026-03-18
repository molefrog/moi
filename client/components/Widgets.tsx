import { useState } from 'react'

import { AnimatePresence, motion } from 'motion/react'

import { SpaceName } from './SpaceName'
import { Button } from './ui/button'

export function Widgets() {
  const [editing, setEditing] = useState(false)

  return (
    <div className="group flex h-full flex-col">
      <header className="flex items-center justify-between pb-4">
        <SpaceName />
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={editing ? 'done' : 'edit'}
            variants={{
              from: { opacity: 0, scale: 0.8, filter: 'blur(4px)' },
              to: { opacity: 1, scale: 1, filter: 'blur(0px)' }
            }}
            initial="from"
            animate="to"
            exit="from"
            transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
          >
            {editing ? (
              <Button onClick={() => setEditing(false)}>Done</Button>
            ) : (
              <Button
                variant="ghost"
                className="text-muted-foreground group-hover:opacity-100 [@media(hover:hover)]:opacity-0"
                onClick={() => setEditing(true)}
              >
                Edit widgets
              </Button>
            )}
          </motion.div>
        </AnimatePresence>
      </header>
      <div className="grid grid-cols-2 grid-rows-[136px_136px_auto] gap-4">
        <div className="bg-black/4 col-span-2 rounded-xl" />
        <div className="bg-black/4 rounded-xl" />
        <div className="bg-black/4 rounded-xl" />
        <div className="bg-black/4 col-span-2 rounded-xl" />
      </div>
    </div>
  )
}
