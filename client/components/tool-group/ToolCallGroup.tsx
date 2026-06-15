// Renders a mixed timeline of agent parts (reasoning + tool calls). Standalone —
// lifted from the chat transcript (client/components/TurnView.tsx) so we can
// iterate on the design in isolation (see /playground/tool-calls). Takes
// `Part[]` directly and `cwd` as a prop, so it renders with no workspace
// provider mounted.
//
// Layout: each row is a two-column flex — a left timeline rail (one node per row
// linked by a 1px rule) and a collapsible header/body. The body animates open
// (Collapse, height spring) and renders via ToolOutput (syntax-highlighted code
// /json when detected, plain text otherwise). Formatting + detection live in
// ./format and ./detect; the animation in ./Collapse; output in ./ToolOutput.
import { type ReactNode, useState } from 'react'

import { IconChevronRight, IconLoader2, IconPlug } from '@tabler/icons-react'
import { motion } from 'motion/react'

import { cn } from '@/client/lib/cn'
import { formatMcpServerName, getMcpIcon } from '@/client/lib/mcp-icons'
import type { Part, ToolCall } from '@/lib/types'

import { Collapse } from './Collapse'
import { ToolOutput } from './ToolOutput'
import {
  formatInputBrief,
  formatMcpTool,
  getToolDisplayName,
  parseMcporterCall,
  parseNativeMcp
} from './format'

type ToolCallGroupProps = {
  // A mixed timeline of parts; reasoning + tool-call render, others are skipped.
  parts: Part[]
  // Working directory used to shorten absolute paths in tool briefs. Pass the
  // workspace cwd to match the live chat; null leaves paths absolute.
  cwd?: string | null
  // Whether the agent is still working. Drives the live last row: a trailing
  // reasoning shows "Thinking" (vs "Thought"); a trailing running tool spins.
  processing?: boolean
}

export function ToolCallGroup({ parts, cwd = null, processing = false }: ToolCallGroupProps) {
  const rows = parts.filter(p => p.type === 'reasoning' || p.type === 'tool-call')
  return (
    <div className="flex flex-col">
      {rows.map((part, i) => {
        const isLast = i === rows.length - 1
        const pos = { isFirst: i === 0, isLast }
        if (part.type === 'reasoning')
          // A reasoning block reads as live "Thinking" only while it's the last
          // row of an active stream; anything after it makes it a done "Thought".
          return (
            <ReasoningRow key={i} text={part.text} inProgress={processing && isLast} {...pos} />
          )
        return <ToolCallCard key={part.call.toolCallId || i} call={part.call} cwd={cwd} {...pos} />
      })}
    </div>
  )
}

// Where a row sits in the group — drives which rail segments to draw so the rule
// starts on the first node and ends on the last.
type RowPosition = { isFirst: boolean; isLast: boolean }

// Row wrapper + left timeline rail: one node per row linked by a 1px vertical
// rule. The node sits at the header's first-line center (`top-[15px]`); the rule
// above spans 0→node, below spans node→bottom (covering an expanded body down to
// the next node). Adjacent rows are flush, so segments join. `marker` replaces
// the dot with a custom node (e.g. an MCP server logo).
type TimelineRowProps = RowPosition & {
  marker?: ReactNode
  // In-progress dotted row: a small spinner replaces the dot node (ignored when
  // `marker` is set — icon rows keep their logo and spin in the header).
  loading?: boolean
  isError?: boolean
  children: ReactNode
}
function TimelineRow({
  isFirst,
  isLast,
  marker,
  loading = false,
  isError = false,
  children
}: TimelineRowProps) {
  return (
    <div className="group/row relative flex gap-2.5">
      {/* Odd rail width (13px) puts the centerline on a half-pixel, so a crisp
          1px rule lands on a single pixel column instead of straddling two. */}
      <div className="relative w-[13px] shrink-0">
        {!isFirst && (
          <span className="absolute top-0 left-1/2 h-4 w-px -translate-x-1/2 bg-border" />
        )}
        {!isLast && (
          <span className="absolute top-[15px] bottom-0 left-1/2 w-px -translate-x-1/2 bg-border" />
        )}
        {marker ? (
          <span className="absolute top-[15px] left-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
            {marker}
          </span>
        ) : loading ? (
          // A spinner node stands in for the dot; bg-background carves the rule.
          <span className="absolute top-[15px] left-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 rounded-full bg-background p-0.5">
            <IconLoader2 size={10} stroke={2.75} className="animate-spin text-ring" />
          </span>
        ) : (
          // Background-colored ring carves a gap in the rule around the dot.
          <span
            className={cn(
              'absolute top-[15px] left-1/2 z-10 size-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full ring-3 ring-background',
              isError ? 'bg-red-400' : 'bg-border'
            )}
          />
        )}
      </div>
      {children}
    </div>
  )
}

// Disclosure chevron — hidden until the row is hovered or open; rotates with a
// spring (same feel as the meta-ficus accordion).
function RowChevron({ open }: { open: boolean }) {
  return (
    <motion.span
      animate={{ rotate: open ? 90 : 0 }}
      transition={{ type: 'spring', duration: 0.2, bounce: 0.1 }}
      className={cn(
        'flex shrink-0',
        open ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100'
      )}
    >
      <IconChevronRight size={12} stroke={2.2} />
    </motion.span>
  )
}

const HEADER = 'flex w-full items-center gap-2 py-1.5 text-left select-none'

type ToolRowProps = RowPosition & {
  call: ToolCall
  leading?: ReactNode
  marker?: ReactNode
  name: string
  brief: string
}
function ToolRow({ isFirst, isLast, call, leading, marker, name, brief }: ToolRowProps) {
  const [open, setOpen] = useState(false)
  const isError = call.state === 'error'
  const isRunning = call.state === 'running' || call.state === 'pending'
  const output = isError
    ? (call.errorText ?? '')
    : typeof call.output === 'string'
      ? call.output
      : ''
  const hasBody = !!(output || isError)
  const title = brief ? `${name}: ${brief}` : name

  return (
    <TimelineRow
      isFirst={isFirst}
      isLast={isLast}
      marker={marker}
      loading={isRunning}
      isError={isError}
    >
      <div className="min-w-0 flex-1">
        <button
          type="button"
          title={title}
          onClick={() => hasBody && setOpen(o => !o)}
          className={cn(HEADER, hasBody ? 'cursor-pointer' : 'cursor-default')}
        >
          {leading}
          <span className="shrink-0 text-xs font-medium whitespace-nowrap">{name}</span>
          {brief && <span className="min-w-0 truncate text-[11px] text-ring">{brief}</span>}
          {/* Dotted rows spin at the node instead; only icon (MCP) rows, whose
              node can't spin, keep a header spinner. */}
          {isRunning && marker && (
            <IconLoader2 size={12} stroke={1.5} className="shrink-0 animate-spin text-ring" />
          )}
          {hasBody && <RowChevron open={open} />}
        </button>
        {hasBody && (
          <Collapse open={open}>
            <div className="mt-1 mb-1">
              <ToolOutput call={call} output={output} isError={isError} />
            </div>
          </Collapse>
        )}
      </div>
    </TimelineRow>
  )
}

// Reasoning row — collapsible thought text as italic prose. Labelled "Thinking"
// while live (spinner node), "Thought" once done (dot node). No leading glyph.
type ReasoningRowProps = RowPosition & { text: string; inProgress?: boolean }
function ReasoningRow({ isFirst, isLast, text, inProgress = false }: ReasoningRowProps) {
  const [open, setOpen] = useState(false)
  const label = inProgress ? 'Thinking' : 'Thought'
  return (
    <TimelineRow isFirst={isFirst} isLast={isLast} loading={inProgress}>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          title={`${label}: ${text}`}
          onClick={() => setOpen(o => !o)}
          className={cn(HEADER, 'cursor-pointer')}
        >
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <RowChevron open={open} />
        </button>
        <Collapse open={open}>
          <div className="mt-1 mb-1 pr-2 text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
            {text}
          </div>
        </Collapse>
      </div>
    </TimelineRow>
  )
}

// Dispatch a tool call to the right row chrome: the server-branded card for an
// MCP shape (`mcporter call …` Bash or a native `mcp__server__tool` name), else
// a plain tool row.
type ToolCallCardProps = RowPosition & { call: ToolCall; cwd: string | null }
function ToolCallCard({ call, cwd, isFirst, isLast }: ToolCallCardProps) {
  const mcp = parseMcporterCall(call) ?? parseNativeMcp(call)
  if (mcp) {
    const fn = formatMcpTool(mcp.server, mcp.tool)
    return (
      <ToolRow
        isFirst={isFirst}
        isLast={isLast}
        call={call}
        marker={<McpLogo src={getMcpIcon(mcp.server)} />}
        name={formatMcpServerName(mcp.server)}
        brief={mcp.rest ? `${fn} ${mcp.rest}` : fn}
      />
    )
  }
  return (
    <ToolRow
      isFirst={isFirst}
      isLast={isLast}
      call={call}
      leading={<CallerBadge call={call} />}
      name={getToolDisplayName(call)}
      brief={formatInputBrief(call, cwd)}
    />
  )
}

// The MCP server logo, used as the timeline node. The bg-colored ring carves it
// out of the rule, matching the dot rows.
function McpLogo({ src }: { src?: string }) {
  return (
    <span className="block size-4 overflow-hidden rounded-[3px] bg-muted ring-2 ring-background">
      {src ? (
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        <IconPlug size={12} stroke={1.5} className="m-0.5 text-muted-foreground" />
      )}
    </span>
  )
}

function CallerBadge({ call }: { call: ToolCall }) {
  if (call.caller !== 'mcp' && call.caller !== 'server-tool') return null
  const label =
    call.caller === 'mcp'
      ? `mcp${call.mcpServer ? `:${call.mcpServer.slice(0, 8)}` : ''}`
      : 'server'
  return (
    <span className="shrink-0 rounded border border-border px-1 text-[9px] text-muted-foreground uppercase">
      {label}
    </span>
  )
}
