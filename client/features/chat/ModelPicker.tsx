import { memo, useState } from 'react'

import { IconChevronDown } from '@tabler/icons-react'

import { useSaveThreadConfig, useThreadConfig, useWorkspaceModels } from './api'
import { useWorkspaceLayoutCtx } from '@/client/features/workspace/WorkspaceLayoutContext'
import { useLive } from '@/client/features/chat/chat-store'
import type { Model } from '@/lib/types'

import { Button } from '@/client/components/ui/button'
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
} from '@/client/components/ui/dropdown-menu'
import { Switch } from '@/client/components/ui/switch'

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

// Output price ($/Mtok) parsed from a model's "$in/$out per Mtok" blurb.
function outputPrice(description?: string): number {
  const m = description?.match(/\$\d+(?:\.\d+)?\s*\/\s*\$(\d+(?:\.\d+)?)\s*per Mtok/)
  return m ? Number(m[1]) : -1
}

// Canonical wire id without a context-variant suffix, e.g.
// 'claude-opus-4-8[1m]' → 'claude-opus-4-8'. Groups a model with its variants.
function familyOf(m: Model): string | undefined {
  return m.resolvedModel?.replace(/\[[^\]]*\]$/, '')
}

// Sort key ordering models most-capable-first (Fable → Opus → Sonnet → Haiku)
// from price alone, no hardcoded names. A bare alias that omits its price (e.g.
// plain 'opus') borrows a same-family variant's price ('opus[1m]'s $/Mtok) so
// the two group together. Unpriced models (OpenClaw) return -1 → sort last,
// keeping their original order since they're all equal.
function sortPrice(m: Model, all: Model[]): number {
  const own = outputPrice(m.description)
  if (own >= 0) return own
  const family = familyOf(m)
  const sibling = all.find(
    x => x !== m && familyOf(x) === family && outputPrice(x.description) >= 0
  )
  return sibling ? outputPrice(sibling.description) : -1
}

type ModelPickerProps = {
  scope?: 'active-chat' | 'workspace'
}

// Model selector for the chat composer. Renders the workspace's available
// models from `/api/workspaces/:id/models`. Model + reasoning effort are
// persisted PER THREAD (so a thread reopens with the settings it last ran with)
// once a thread exists; while no thread is open (a brand-new chat) the picker
// edits the workspace defaults, which seed the new thread. Both are sent with
// each chat frame (see useChat); leaving them untouched runs on the SDK default.
// Fast mode remains local-only for now.
// The workspace scope gives new-chat surfaces such as the view builder the same
// defaults that their submit path reads. The active-chat scope persists per
// thread once one exists.
// Memoized because composer text changes should not re-render the picker.
export const ModelPicker = memo(function ModelPicker({ scope = 'active-chat' }: ModelPickerProps) {
  const { workspaceId, layout, setLayout } = useWorkspaceLayoutCtx()
  const { data } = useWorkspaceModels(workspaceId)
  // The SDK prepends a synthetic "default" entry ("Use the default model
  // (currently …)"). Drop it and surface the concrete model it resolves to
  // instead, so the picker shows e.g. "Opus (1M context)" rather than the meta
  // "use default" row.
  const allModels = data?.models ?? []
  const defaultEntry = allModels.find(m => m.value === 'default')
  // Drop the "default" entry, then order by price descending. Array.sort is
  // stable, so same-price variants (Opus 1M vs standard) keep the SDK's order.
  const models = allModels
    .filter(m => m.value !== 'default')
    .sort((a, b) => sortPrice(b, allModels) - sortPrice(a, allModels))

  // The active thread, if any. Its stored config is the source of truth; a new
  // chat (no active thread) falls back to — and edits — the workspace defaults.
  const activeSessionId = useLive(s =>
    scope === 'active-chat' ? (s.activeByWorkspace[workspaceId] ?? null) : null
  )
  const threadCfg = useThreadConfig(workspaceId, activeSessionId).data
  const saveThreadCfg = useSaveThreadConfig(workspaceId)
  const [fastMode, setFastMode] = useState(false)

  const selected = (activeSessionId ? threadCfg?.model : undefined) ?? layout.selectedModel
  const selectedEffort = (activeSessionId ? threadCfg?.effort : undefined) ?? layout.selectedEffort
  const setSelected = (value: string) => {
    if (activeSessionId)
      saveThreadCfg.mutate({ sessionId: activeSessionId, patch: { model: value } })
    else setLayout({ selectedModel: value })
  }
  const setEffort = (value: string) => {
    if (activeSessionId)
      saveThreadCfg.mutate({ sessionId: activeSessionId, patch: { effort: value } })
    else setLayout({ selectedEffort: value })
  }

  if (models.length === 0) return null

  // Show the persisted pick when it's still in the list; otherwise fall back to
  // the concrete model the SDK default resolves to (matched by resolvedModel),
  // or the first model. An unset pick sends no model id, so the run still uses
  // the SDK default — the display just names it instead of showing "default".
  const persisted = models.some(m => m.value === selected) ? selected : undefined
  const defaultModel =
    models.find(
      m => defaultEntry?.resolvedModel && m.resolvedModel === defaultEntry.resolvedModel
    ) ?? models[0]
  const current = persisted ?? defaultModel.value
  const model = models.find(m => m.value === current) ?? models[0]
  const effortLevels = model.supportsEffort ? (model.supportedEffortLevels ?? []) : []
  const currentEffort =
    selectedEffort && effortLevels.includes(selectedEffort) ? selectedEffort : effortLevels[0]
  const showReasoning = effortLevels.length > 0
  // Fast mode is Claude-only (Opus); OpenClaw models never report supportsFastMode.
  const showFastMode = !!model.supportsFastMode

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost">
            <span className="font-normal text-foreground">
              {headline(model.description) || model.displayName}
            </span>
            {currentEffort && (
              <span className="text-muted-foreground">{effortLabel(currentEffort)}</span>
            )}
            <IconChevronDown stroke={1.5} />
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
                  <span className="ml-auto text-muted-foreground">
                    {effortLabel(currentEffort)}
                  </span>
                )}
              </div>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup value={currentEffort} onValueChange={setEffort}>
                {effortLevels.map(level => (
                  <DropdownMenuRadioItem key={level} value={level} closeOnClick>
                    {effortLabel(level)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        {showFastMode && (
          <DropdownMenuGroup className="mt-0.5">
            <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xs px-2 py-1 text-sm">
              Fast mode
              <Switch checked={fastMode} onCheckedChange={setFastMode} />
            </label>
          </DropdownMenuGroup>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
})
