import { useState } from 'react'

import { IconChevronDown } from '@tabler/icons-react'

import { useWorkspaceModels } from '@/client/api/workspaces'
import { useWorkspaceLayoutCtx } from '@/client/lib/WorkspaceLayoutContext'

import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from './ui/dropdown-menu'
import { Switch } from './ui/switch'

// Model selector for the chat composer. Renders the workspace's available
// models from `/api/workspaces/:id/models`. Not wired up yet — the selection
// and fast-mode toggle are local-only and don't affect what gets sent.
export function ModelPicker() {
  const { workspaceId } = useWorkspaceLayoutCtx()
  const { data } = useWorkspaceModels(workspaceId)
  const models = data?.models ?? []

  const [selected, setSelected] = useState<string | undefined>(undefined)
  const [fastMode, setFastMode] = useState(false)

  // Visually default to the first model until the user picks one.
  const current = selected ?? models[0]?.id
  const currentModel = models.find(m => m.id === current)

  if (models.length === 0) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
            <span className="text-foreground">{currentModel?.name ?? 'Model'}</span>
            <IconChevronDown className="size-3.5! text-muted-foreground/60" stroke={1.5} />
          </Button>
        }
      />
      <DropdownMenuContent align="start" side="top" className="min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Models</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={current} onValueChange={setSelected}>
            {models.map(model => (
              <DropdownMenuRadioItem key={model.id} value={model.id} closeOnClick>
                {model.name}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Fast mode</DropdownMenuLabel>
          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xs px-2 py-1 text-sm">
            Enable fast mode
            <Switch checked={fastMode} onCheckedChange={setFastMode} />
          </label>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
