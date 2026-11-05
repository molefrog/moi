import { useState } from 'react'

import { IconDots, IconLetterCase, IconSettings } from '@tabler/icons-react'

import { WorkspaceIcon } from '@/client/components/shared/workspace-icon'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/client/components/ui/dropdown-menu'
import {
  WorkspaceSettingsDialog,
  WorkspaceSettingsDialogTrigger
} from '@/client/features/workspace/settings/workspace-settings-dialog'
import { useWorkspaceLayoutCtx } from './workspace-layout-context'

type WorkspaceMenuProps = {
  onOpenTheme: () => void
}

export function WorkspaceMenu({ onOpenTheme }: WorkspaceMenuProps) {
  const { layout, name, provider } = useWorkspaceLayoutCtx()
  const [iconHovered, setIconHovered] = useState(false)

  return (
    <WorkspaceSettingsDialog>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex min-w-0 cursor-pointer items-center gap-2 rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-label={`${name ?? 'Workspace'} menu`}
          onPointerEnter={() => setIconHovered(true)}
          onPointerLeave={() => setIconHovered(false)}
        >
          {iconHovered ? (
            <IconDots size={20} stroke={1.5} className="shrink-0" aria-hidden="true" />
          ) : (
            <WorkspaceIcon
              icon={layout.icon}
              workspaceType={provider}
              workspaceTheme={layout.theme}
              className="size-5 rounded-sm"
            />
          )}
          {name && <span className="truncate text-sm font-medium text-foreground">{name}</span>}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={6} className="w-36">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={onOpenTheme}>
              <IconLetterCase stroke={1.75} />
              Theme
            </DropdownMenuItem>
            <DropdownMenuItem
              nativeButton
              render={<WorkspaceSettingsDialogTrigger />}
              className="w-full"
            >
              <IconSettings stroke={1.75} />
              Settings
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </WorkspaceSettingsDialog>
  )
}
