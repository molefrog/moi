import { memo, useState } from 'react'

import { useSaveThreadConfig, useThreadConfig, useWorkspaceModels } from './api'
import {
  hasEffortChoice,
  resolveDisplayedEffort,
  resolveEffortIndex,
  sortModelsByProviderOrder
} from './model-order'
import { Button } from '@/client/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from '@/client/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger
} from '@/client/components/ui/popover'
import { Slider } from '@/client/components/ui/slider'
import { useLive } from '@/client/features/chat/chat-store'
import { useWorkspaceLayoutCtx } from '@/client/features/workspace/WorkspaceLayoutContext'
import type { Model } from '@/lib/types'

// Models describe themselves with a " · "-joined blurb; we show only the
// headline (e.g. "Opus 4.8 with 1M context · Most capable…" → "Opus 4.8 with 1M context").
function headline(description?: string): string {
  return description?.split(/\s*·\s*/)[0] ?? ''
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Display label for a reasoning-effort level. Values stay as the SDK's ids
// ('low'…'max'); only the label differs — 'xhigh' reads as "Extra".
function effortLabel(level: string): string {
  return level === 'xhigh' ? 'Extra' : capitalize(level)
}

type ModelDropdownProps = {
  current: string
  model: Model
  models: readonly Model[]
  onValueChange: (value: string) => void
}

function ModelDropdown({ current, model, models, onValueChange }: ModelDropdownProps) {
  const label = headline(model.description) || model.displayName

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className="group/model max-w-56 min-w-0 px-2"
            aria-label={`Model: ${label}`}
          >
            <span className="truncate font-normal text-muted-foreground transition-colors group-focus-within/composer:text-foreground group-data-[popup-open]/model:text-foreground">
              {label}
            </span>
          </Button>
        }
      />
      <DropdownMenuContent align="end" side="top" className="min-w-40">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Models</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={current} onValueChange={onValueChange}>
            {models.map(item => (
              <DropdownMenuRadioItem key={item.value} value={item.value} closeOnClick>
                {headline(item.description) || item.displayName}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

type EffortPickerProps = {
  currentEffort: string
  effortLevels: readonly string[]
  onValueChange: (value: string) => void
}

function EffortPicker({ currentEffort, effortLevels, onValueChange }: EffortPickerProps) {
  const currentIndex = resolveEffortIndex(effortLevels, currentEffort)
  const [open, setOpen] = useState(false)
  const [draftIndex, setDraftIndex] = useState(currentIndex)
  const displayedIndex = open ? draftIndex : currentIndex
  const displayedEffort = effortLevels[displayedIndex] ?? currentEffort
  const displayedLabel = effortLabel(displayedEffort)

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) setDraftIndex(currentIndex)
    setOpen(nextOpen)
  }

  const commitEffort = (index: number) => {
    const nextEffort = effortLevels[index]
    if (nextEffort && nextEffort !== currentEffort) onValueChange(nextEffort)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <Button variant="ghost" className="px-2" aria-label={`Effort: ${displayedLabel}`}>
            <span className="font-normal text-muted-foreground transition-colors group-focus-within/composer:text-foreground">
              {displayedLabel}
            </span>
          </Button>
        }
      />
      <PopoverContent align="end" side="top" className="w-64">
        <PopoverHeader className="flex-row items-center gap-1">
          <PopoverTitle>Effort</PopoverTitle>
          <output className="text-muted-foreground" aria-live="polite">
            {displayedLabel}
          </output>
        </PopoverHeader>
        <div className="flex items-center justify-between text-muted-foreground" aria-hidden="true">
          <span>Faster</span>
          <span>Smarter</span>
        </div>
        <Slider
          value={draftIndex}
          min={0}
          max={effortLevels.length - 1}
          step={1}
          marks={effortLevels.length}
          onValueChange={setDraftIndex}
          onValueCommitted={commitEffort}
          getAriaLabel={() => 'Reasoning effort'}
          getAriaValueText={(_formattedValue, value) =>
            effortLabel(effortLevels[value] ?? currentEffort)
          }
        />
      </PopoverContent>
    </Popover>
  )
}

type ModelPickerProps = {
  scope?: 'active-chat' | 'workspace'
}

// Model selector for composer surfaces. The workspace's available models come
// from `/api/workspaces/:id/models`; effort options follow the selected model.
// Model + effort persist per chat once one exists. A new chat edits the
// workspace defaults that seed it. Both values are sent with each chat frame.
// The workspace scope gives new-chat surfaces such as the view builder the same
// defaults that their submit path reads.
export const ModelPicker = memo(function ModelPicker({ scope = 'active-chat' }: ModelPickerProps) {
  const { workspaceId, layout, setLayout } = useWorkspaceLayoutCtx()
  const { data } = useWorkspaceModels(workspaceId)

  // The SDK prepends a synthetic "default" entry ("Use the default model
  // (currently …)"). Drop it and name the concrete model it resolves to.
  const allModels = data?.models ?? []
  const defaultEntry = allModels.find(model => model.value === 'default')
  const models = data
    ? sortModelsByProviderOrder(
        allModels.filter(model => model.value !== 'default'),
        data.provider
      )
    : []

  // The active chat's stored config is the source of truth. With no active chat,
  // the picker reads and edits workspace defaults.
  const activeSessionId = useLive(state =>
    scope === 'active-chat' ? (state.activeByWorkspace[workspaceId] ?? null) : null
  )
  const threadConfig = useThreadConfig(workspaceId, activeSessionId).data
  const saveThreadConfig = useSaveThreadConfig(workspaceId)

  const selectedModel = (activeSessionId ? threadConfig?.model : undefined) ?? layout.selectedModel
  const selectedEffort =
    (activeSessionId ? threadConfig?.effort : undefined) ?? layout.selectedEffort

  const setSelectedModel = (value: string) => {
    if (activeSessionId)
      saveThreadConfig.mutate({ sessionId: activeSessionId, patch: { model: value } })
    else setLayout({ selectedModel: value })
  }

  const setSelectedEffort = (value: string) => {
    if (activeSessionId)
      saveThreadConfig.mutate({ sessionId: activeSessionId, patch: { effort: value } })
    else setLayout({ selectedEffort: value })
  }

  if (models.length === 0) return null

  // Show a persisted pick when it still exists. Otherwise name the concrete
  // model behind the SDK default, or fall back to the first available model.
  const persistedModel = models.some(model => model.value === selectedModel)
    ? selectedModel
    : undefined
  const defaultModel =
    models.find(
      model => defaultEntry?.resolvedModel && model.resolvedModel === defaultEntry.resolvedModel
    ) ?? models[0]
  const currentModelValue = persistedModel ?? defaultModel.value
  const model = models.find(item => item.value === currentModelValue) ?? models[0]
  const effortLevels = model.supportsEffort ? (model.supportedEffortLevels ?? []) : []
  const currentEffort = resolveDisplayedEffort(effortLevels, selectedEffort)
  const showEffort = hasEffortChoice(effortLevels) && currentEffort !== undefined

  return (
    <div className="flex shrink-0 items-center gap-1">
      <ModelDropdown
        current={currentModelValue}
        model={model}
        models={models}
        onValueChange={setSelectedModel}
      />
      {showEffort && (
        <EffortPicker
          key={model.value}
          currentEffort={currentEffort}
          effortLevels={effortLevels}
          onValueChange={setSelectedEffort}
        />
      )}
    </div>
  )
})
