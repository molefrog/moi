import type { ComponentProps, ReactNode } from 'react'

import { WorkspaceIcon } from '@/client/components/shared/WorkspaceIcon'
import { InlineInput } from '@/client/components/ui/inline-input'
import { cn } from '@/client/lib/cn'

export type WorkspaceIdentityProps = Omit<ComponentProps<typeof WorkspaceIcon>, 'className'> & {
  name?: string
  onNameChange?: (name: string) => void
  onNameCommit?: (name: string) => void
  renderIcon?: (icon: ReactNode) => ReactNode
}

export function WorkspaceIdentity({
  name = 'Workspace',
  onNameChange,
  onNameCommit,
  renderIcon,
  ...iconProps
}: WorkspaceIdentityProps) {
  const icon = <WorkspaceIcon {...iconProps} className="size-10 rounded-lg" />

  return (
    <div className="flex max-w-full min-w-0 flex-1 items-center gap-4">
      {renderIcon ? renderIcon(icon) : icon}
      <InlineInput
        aria-label="Workspace name"
        value={name}
        onValueChange={onNameChange}
        onValueCommit={onNameCommit}
        readOnly={!onNameChange}
        tabIndex={onNameChange ? undefined : -1}
        className={cn(
          'min-w-0 truncate text-3xl font-semibold md:text-3xl',
          !onNameChange && 'pointer-events-none'
        )}
      />
    </div>
  )
}
