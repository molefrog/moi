import type { ReactNode } from 'react'

import { IconX } from '@tabler/icons-react'

import { Button } from '@/client/components/ui/button'
import { DialogClose, DialogContent } from '@/client/components/ui/dialog'

type WorkspaceDialogContentProps = {
  children: ReactNode
  closeDisabled?: boolean
}

export function WorkspaceDialogContent({
  children,
  closeDisabled = false
}: WorkspaceDialogContentProps) {
  return (
    <DialogContent className="w-[calc(100%-2rem)] max-w-md p-6">
      <DialogClose
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close"
            className="absolute top-4 right-4"
            disabled={closeDisabled}
          >
            <IconX stroke={1.75} />
          </Button>
        }
      />
      {children}
    </DialogContent>
  )
}
