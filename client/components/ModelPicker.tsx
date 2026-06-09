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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from './ui/dropdown-menu'
import { Switch } from './ui/switch'

// Models describe themselves with a " · "-joined blurb; we show only the
// headline (e.g. "Opus 4.8 with 1M context · Most capable…" → "Opus 4.8 with 1M context").
function headline(description?: string): string {
  return description?.split(/\s*·\s*/)[0] ?? ''
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Model selector for the chat composer. Renders the workspace's available
// models from `/api/workspaces/:id/models`. The chosen model is persisted in
// the workspace layout (so it survives reloads) and sent with each chat frame
// (see useChat); leaving it untouched sends nothing, so the agent runs on the
// SDK default. Effort and fast-mode remain local-only for now.
export function ModelPicker() {
  const { workspaceId, layout, setLayout } = useWorkspaceLayoutCtx()
  const { data } = useWorkspaceModels(workspaceId)
  const models = data?.models ?? []

  const selected = layout.selectedModel
  const setSelected = (value: string) => setLayout({ selectedModel: value })
  const [effort, setEffort] = useState<string | undefined>(undefined)
  const [fastMode, setFastMode] = useState(false)

  if (models.length === 0) return null

  // Show the persisted pick when it's still in the list; otherwise the first
  // model. An unset pick sends no model id, so the run uses the SDK default.
  const persisted = models.some(m => m.value === selected) ? selected : undefined
  const current = persisted ?? models[0].value
  const model = models.find(m => m.value === current) ?? models[0]
  const effortLevels = model.supportsEffort ? (model.supportedEffortLevels ?? []) : []
  const currentEffort = effort && effortLevels.includes(effort) ? effort : effortLevels[0]
  const showReasoning = effortLevels.length > 0
  // Fast mode is Claude-only (Opus); OpenClaw models never report supportsFastMode.
  const showFastMode = !!model.supportsFastMode

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="default" className="gap-1.5 px-2.5 text-muted-foreground">
            <span className="font-normal text-foreground">
              {headline(model.description) || model.displayName}
            </span>
            {currentEffort && (
              <span className="text-muted-foreground">{capitalize(currentEffort)}</span>
            )}
            <IconChevronDown className="size-3.5! text-muted-foreground/60" stroke={1.5} />
          </Button>
        }
      />
      <DropdownMenuContent align="start" side="top" className="min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Models</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={current} onValueChange={setSelected}>
            {models.map(m => (
              <DropdownMenuRadioItem key={m.value} value={m.value} closeOnClick>
                {headline(m.description) || m.displayName}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>

        {(showReasoning || showFastMode) && <DropdownMenuSeparator />}

        {showReasoning && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <div className="flex flex-1 items-center justify-between">
                Reasoning
                {currentEffort && (
                  <span className="ml-auto text-muted-foreground">{capitalize(currentEffort)}</span>
                )}
              </div>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup value={currentEffort} onValueChange={setEffort}>
                {effortLevels.map(level => (
                  <DropdownMenuRadioItem key={level} value={level} closeOnClick>
                    {capitalize(level)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        {showFastMode && (
          <DropdownMenuGroup className="mt-0.5">
            <DropdownMenuLabel>Fast mode</DropdownMenuLabel>
            <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xs px-2 py-1 text-sm">
              Enable fast mode
              <Switch checked={fastMode} onCheckedChange={setFastMode} />
            </label>
          </DropdownMenuGroup>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
