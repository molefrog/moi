import type { ReactNode } from 'react'

import { DialogContent } from '@/client/components/ui/dialog'

type WorkspaceDialogContentProps = {
  children: ReactNode
  showCloseButton?: boolean
}

export function WorkspaceDialogContent({
  children,
  showCloseButton = true
}: WorkspaceDialogContentProps) {
  return (
    <DialogContent
      showCloseButton={showCloseButton}
      className="block max-h-[calc(100dvh-2rem)] w-max max-w-[calc(100vw-2rem)] overflow-y-auto p-6 sm:max-w-[calc(100vw-2rem)]"
    >
      {children}
    </DialogContent>
  )
}
