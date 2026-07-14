// Subagent ("Agent" tool) row — matches the chat card: a node + the "Agent: <task>"
// header, and the LATEST ACTION (the last `progress` line) as a muted sub-row
// while running, switching to the step count once done. While running the node
// cycles sport glyphs and the header shimmers; once finished a duration badge sits
// top-right and expanding shows the subagent's nested transcript as a recursive
// sub-timeline, then its final summary. The `subagent` record
// (progress/status/usage/transcript) is built live from `task_*` events and isn't
// persisted, so a finished/replayed call shows only the header.
import { type ReactNode, useEffect, useState } from 'react'

import { IconPlayBasketball, IconPlayFootball, IconPlayVolleyball } from '@tabler/icons-react'

import { ShimmerText } from '@/client/features/chat/ShimmerText'
import { cn } from '@/client/lib/cn'
import type { Part, ToolCall } from '@/lib/types'

import { Collapse } from './Collapse'
import { NodeBox, type RowPosition, RowChevron, TimelineRow } from './TimelineRow'
import { formatDuration } from './format'

// While a subagent runs, its node cycles through "playing sport" glyphs — a
// light-hearted "still working" animation in place of a spinner.
const SPORT_ICONS = [IconPlayBasketball, IconPlayVolleyball, IconPlayFootball]
function RunningSportNode() {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI(n => (n + 1) % SPORT_ICONS.length), 600)
    return () => clearInterval(t)
  }, [])
  const Icon = SPORT_ICONS[i]
  return (
    <NodeBox className="size-5">
      <Icon size={16} stroke={1.75} className="text-foreground" />
    </NodeBox>
  )
}

type SubagentCardProps = RowPosition & {
  call: ToolCall
  cwd: string | null
  renderNestedParts: (parts: Part[], cwd: string | null) => ReactNode
}

export function SubagentCard({ call, cwd, isFirst, isLast, renderNestedParts }: SubagentCardProps) {
  const [open, setOpen] = useState(false)
  const sub = call.subagent
  const input = (call.input ?? {}) as { description?: string }
  const description = sub?.description ?? input.description ?? 'Subtask'
  const status = sub?.status
  const isError = call.state === 'error' || status === 'failed'
  const isRunning = call.state === 'running' || status === 'running'
  const toolUses = sub?.usage?.toolUses
  // Wall-clock runtime, shown as a badge once the agent has finished.
  const durationMs = sub?.usage?.durationMs

  // While running → the latest action (last progress line); once done → a verb +
  // count of the steps it took. Same rule as the chat card.
  const latest = isRunning && sub?.progress?.length ? sub.progress[sub.progress.length - 1] : null
  const subLine =
    latest ?? (toolUses != null ? `Took ${toolUses} step${toolUses === 1 ? '' : 's'}` : null)

  const nestedParts = (sub?.transcript ?? []).flatMap(t => t.parts)
  const summary = typeof call.output === 'string' ? call.output : ''
  const hasBody = nestedParts.length > 0 || !!summary

  return (
    <TimelineRow
      isFirst={isFirst}
      isLast={isLast}
      marker={
        isRunning ? (
          <RunningSportNode />
        ) : (
          // Done → the runner reaches the finish: freeze on the football glyph.
          <NodeBox className="size-5">
            <IconPlayFootball size={16} stroke={1.75} className="text-foreground" />
          </NodeBox>
        )
      }
      isError={isError}
    >
      <div className="min-w-0 flex-1">
        <button
          type="button"
          title={`Agent: ${description}`}
          onClick={() => hasBody && setOpen(o => !o)}
          className={cn(
            'group/row flex w-full flex-col items-start gap-0.5 py-1.5 text-left select-none',
            hasBody ? 'cursor-pointer' : 'cursor-default'
          )}
        >
          <span className="flex w-full items-center gap-2">
            <ShimmerText active={isRunning} className="min-w-0 flex-1 truncate text-xs font-medium">
              Agent: {description}
            </ShimmerText>
            {!isRunning && durationMs != null && (
              <span className="shrink-0 rounded-full border border-border px-1.5 text-[10px] font-medium text-muted-foreground tabular-nums">
                {formatDuration(durationMs)}
              </span>
            )}
            {status === 'failed' && <span className="shrink-0 text-xs text-destructive">✗</span>}
            {status === 'stopped' && (
              <span className="shrink-0 text-xs text-muted-foreground">✗</span>
            )}
            {hasBody && <RowChevron open={open} />}
          </span>
          {subLine && (
            <span className="w-full truncate text-xs text-muted-foreground">{subLine}</span>
          )}
        </button>
        {hasBody && (
          <Collapse open={open}>
            {/* One card, two segments: the nested steps (default bg) on top and
                the final summary (muted bg, roomier padding) below, split by a
                border. The divider + summary segment only render when there's a
                summary, so a steps-only card has no trailing border. */}
            <div className="mt-1 mb-1 overflow-hidden rounded-md border border-border">
              {nestedParts.length > 0 && (
                <div className="py-1.5 pr-2 pl-3">{renderNestedParts(nestedParts, cwd)}</div>
              )}
              {summary && (
                <div
                  className={cn(
                    'bg-muted/30 px-3.5 py-3 text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground',
                    nestedParts.length > 0 && 'border-t border-border'
                  )}
                >
                  {summary}
                </div>
              )}
            </div>
          </Collapse>
        )}
      </div>
    </TimelineRow>
  )
}
