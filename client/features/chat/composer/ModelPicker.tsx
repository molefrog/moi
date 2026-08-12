import { type ComponentProps, type ReactNode, memo, useState } from 'react'

import { AnimatePresence, motion } from 'motion/react'

import { IconBolt, IconBoltFilled } from '@tabler/icons-react'

import { useSaveSessionConfig, useSessionConfig } from '../api'
import { useWorkspaceAgent } from '@/client/features/workspace/api'
import {
  groupModels,
  hasEffortChoice,
  resolveDisplayedEffort,
  resolveEffortIndex,
  resolveFastMode,
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
  PopoverTrigger
} from '@/client/components/ui/popover'
import { Slider } from '@/client/components/ui/slider'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/client/components/ui/tooltip'
import { useSelectedSession } from '@/client/features/chat/useSelectedSession'
import { useWorkspaceLayoutCtx } from '@/client/features/workspace/WorkspaceLayoutContext'
import { cn } from '@/client/lib/cn'
import type { Model } from '@/lib/types'

// Models describe themselves with a " · "-joined blurb; we show only the
// headline (e.g. "Opus 4.8 with 1M context · Most capable…" → "Opus 4.8 with 1M context").
function headline(description?: string): string {
  return description?.split(/\s*·\s*/)[0] ?? ''
}

// Row and trigger label. Claude's description headline names the model better
// than its `displayName` ("Sonnet 4.6 with 1M context" vs "Sonnet"); backends
// without one fall back to the name.
function modelLabel(model: Model): string {
  return headline(model.description) || model.displayName
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Display label for a reasoning-effort level. Values stay as the SDK's ids
// ('low'…'max'); only the label differs — 'xhigh' reads as "Extra".
function effortLabel(level: string): string {
  return level === 'xhigh' ? 'Extra' : capitalize(level)
}

function singleSliderValue(value: number | readonly number[]): number {
  return typeof value === 'number' ? value : (value[0] ?? 0)
}

const effortHeaderVariants = {
  from: { opacity: 0, filter: 'blur(4px)' },
  to: { opacity: 1, filter: 'blur(0px)' }
}

const effortHeaderTransition = { type: 'spring', duration: 0.3, delay: 0.1, bounce: 0 } as const

type PickerTriggerProps = Omit<ComponentProps<typeof Button>, 'children' | 'variant'> & {
  label: string
  leadingIcon?: ReactNode
}

function PickerTrigger({ label, leadingIcon, className, ...props }: PickerTriggerProps) {
  return (
    <Button
      {...props}
      variant="ghost"
      className={cn(
        'group/picker max-w-56 min-w-0 px-2 text-muted-foreground hover:text-muted-foreground',
        className
      )}
    >
      {leadingIcon}
      <span className="truncate font-normal">{label}</span>
    </Button>
  )
}

type ModelDropdownProps = {
  current: string
  model: Model
  models: readonly Model[]
  onValueChange: (value: string) => void
}

function ModelDropdown({ current, model, models, onValueChange }: ModelDropdownProps) {
  const label = modelLabel(model)
  const groups = groupModels(models, 'Models')

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<PickerTrigger label={label} className="shrink" aria-label={`Model: ${label}`} />}
      />
      <DropdownMenuContent align="end" side="top" className="w-max max-w-64 min-w-40">
        <DropdownMenuRadioGroup value={current} onValueChange={onValueChange}>
          {groups.map(group => (
            <DropdownMenuGroup key={group.label}>
              <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
              {group.models.map(item => (
                <DropdownMenuRadioItem key={item.value} value={item.value} closeOnClick>
                  {modelLabel(item)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuGroup>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

type EffortPickerProps = {
  currentEffort: string
  effortLevels: readonly string[]
  fastMode: boolean
  showFastMode: boolean
  onFastModeChange: (value: boolean) => void
  onValueChange: (value: string) => void
}

function EffortPicker({
  currentEffort,
  effortLevels,
  fastMode,
  showFastMode,
  onFastModeChange,
  onValueChange
}: EffortPickerProps) {
  const currentIndex = resolveEffortIndex(effortLevels, currentEffort)
  const [open, setOpen] = useState(false)
  const [draftIndex, setDraftIndex] = useState(currentIndex)
  const [dragging, setDragging] = useState(false)
  const displayedIndex = open ? draftIndex : currentIndex
  const displayedEffort = effortLevels[displayedIndex] ?? currentEffort
  const displayedLabel = effortLabel(displayedEffort)

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) setDraftIndex(currentIndex)
    else setDragging(false)
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
          <PickerTrigger
            label={displayedLabel}
            leadingIcon={fastMode ? <IconBolt stroke={1.5} /> : undefined}
            aria-label={`Effort: ${displayedLabel}`}
          />
        }
      />
      <PopoverContent align="end" side="top" className="w-64" disableAnchorTracking>
        <PopoverHeader className="relative h-5 flex-row items-center">
          <AnimatePresence mode="popLayout" initial={false}>
            {dragging ? (
              <motion.div
                key="range"
                className="flex h-5 w-full items-center justify-between text-sm text-muted-foreground"
                aria-hidden="true"
                variants={effortHeaderVariants}
                initial="from"
                animate="to"
                exit="from"
                transition={effortHeaderTransition}
              >
                <span>Faster</span>
                <span>Smarter</span>
              </motion.div>
            ) : (
              <motion.div
                key="effort"
                className="flex h-5 w-full items-center justify-between gap-2"
                variants={effortHeaderVariants}
                initial="from"
                animate="to"
                exit="from"
                transition={effortHeaderTransition}
              >
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">Effort</span>
                  <output aria-live="polite">{displayedLabel}</output>
                </div>
                {showFastMode && (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={fastMode ? 'Turn off Fast mode' : 'Turn on Fast mode'}
                          aria-pressed={fastMode}
                          onClick={() => onFastModeChange(!fastMode)}
                          className="-my-1 -mr-1"
                        >
                          {fastMode ? (
                            <IconBoltFilled className="text-primary" />
                          ) : (
                            <IconBolt className="text-muted-foreground" stroke={1.5} />
                          )}
                        </Button>
                      }
                    />
                    <TooltipContent align="center" className="flex-col gap-0">
                      <span>Fast mode</span>
                      <span className="font-normal text-muted-foreground">More usage</span>
                    </TooltipContent>
                  </Tooltip>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </PopoverHeader>
        <label className="block">
          <span className="sr-only">Reasoning effort</span>
          <Slider
            value={draftIndex}
            min={0}
            max={effortLevels.length - 1}
            step={1}
            onPointerDown={event => {
              if (event.button === 0) setDragging(true)
            }}
            onPointerCancel={() => setDragging(false)}
            onValueChange={value => setDraftIndex(singleSliderValue(value))}
            onValueCommitted={value => {
              setDragging(false)
              commitEffort(singleSliderValue(value))
            }}
            className={cn(
              '**:data-[slot=slider-track]:h-6 **:data-[slot=slider-track]:rounded-sm',
              '**:data-[slot=slider-thumb]:h-6 **:data-[slot=slider-thumb]:w-5 **:data-[slot=slider-thumb]:rounded-sm **:data-[slot=slider-thumb]:border-0 **:data-[slot=slider-thumb]:bg-card **:data-[slot=slider-thumb]:shadow-xs **:data-[slot=slider-thumb]:ring-0'
            )}
          >
            <span
              data-slot="slider-marks"
              aria-hidden="true"
              className="absolute inset-x-2 flex items-center justify-between"
            >
              {Array.from({ length: effortLevels.length }, (_, index) => (
                <span
                  key={index}
                  className={cn(
                    'size-1 rounded-full',
                    index <= draftIndex ? 'bg-primary-foreground/30' : 'bg-foreground/30'
                  )}
                />
              ))}
            </span>
          </Slider>
        </label>
      </PopoverContent>
    </Popover>
  )
}

type ModelPickerProps = {
  scope?: 'active-chat' | 'workspace'
}

// Model selector for composer surfaces. The workspace's available models come
// from `/api/workspaces/:id/agent`; effort options follow the selected model.
// Model, effort, and Fast mode persist per chat once one exists. A new chat
// edits the workspace defaults that seed it. All values are sent with each chat
// frame. The workspace scope gives new-chat surfaces such as the view builder
// the same defaults that their submit path reads.
export const ModelPicker = memo(function ModelPicker({ scope = 'active-chat' }: ModelPickerProps) {
  const { workspaceId, layout, setLayout } = useWorkspaceLayoutCtx()
  const [selectedSessionId] = useSelectedSession()
  const { data } = useWorkspaceAgent(workspaceId)

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

  // The selected chat's stored config is the source of truth. With New chat,
  // the picker reads and edits workspace defaults.
  const sessionId = scope === 'active-chat' ? (selectedSessionId ?? null) : null
  const sessionConfig = useSessionConfig(workspaceId, sessionId).data
  const saveSessionConfig = useSaveSessionConfig(workspaceId)

  const selectedModel = (sessionId ? sessionConfig?.model : undefined) ?? layout.selectedModel
  const selectedEffort = (sessionId ? sessionConfig?.effort : undefined) ?? layout.selectedEffort
  const selectedFastMode =
    (sessionId ? sessionConfig?.fastMode : undefined) ?? layout.selectedFastMode

  const setSelectedModel = (value: string) => {
    if (sessionId) saveSessionConfig.mutate({ sessionId, patch: { model: value } })
    else setLayout({ selectedModel: value })
  }

  const setSelectedEffort = (value: string) => {
    if (sessionId) saveSessionConfig.mutate({ sessionId, patch: { effort: value } })
    else setLayout({ selectedEffort: value })
  }

  const setSelectedFastMode = (value: boolean) => {
    if (sessionId) saveSessionConfig.mutate({ sessionId, patch: { fastMode: value } })
    else setLayout({ selectedFastMode: value })
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
  const currentEffort = resolveDisplayedEffort(effortLevels, selectedEffort, model.defaultEffort)
  const showEffort = hasEffortChoice(effortLevels) && currentEffort !== undefined
  const fastMode = resolveFastMode(model, selectedFastMode)

  return (
    <div className="flex min-w-0 items-center gap-1">
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
          fastMode={fastMode}
          showFastMode={model.supportsFastMode === true}
          onFastModeChange={setSelectedFastMode}
          onValueChange={setSelectedEffort}
        />
      )}
    </div>
  )
})
