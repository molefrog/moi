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
      className="block w-[calc(100%-2rem)] max-w-xl overflow-hidden p-6 sm:max-w-xl"
    >
      {children}
    </DialogContent>
  )
}
