import type { ReactNode } from 'react'

import { DialogContent } from '@/client/components/ui/dialog'

type WorkspaceDialogContentProps = {
  children: ReactNode
  closeDisabled?: boolean
}

export function WorkspaceDialogContent({
  children,
  closeDisabled = false
}: WorkspaceDialogContentProps) {
  return (
    <DialogContent showCloseButton={!closeDisabled} className="w-[calc(100%-2rem)] p-6 sm:max-w-xl">
      {children}
    </DialogContent>
  )
}
