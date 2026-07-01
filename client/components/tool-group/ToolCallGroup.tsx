// Renders a mixed timeline of agent parts (reasoning + tool calls). Standalone —
// lifted from the chat transcript (client/components/TurnView.tsx) so we can
// iterate on the design in isolation (see /playground/tool-calls). Takes
// `Part[]` directly and `cwd` as a prop, so it renders with no workspace
// provider mounted.
//
// Layout: each row is a two-column flex — a left timeline rail (one node per row
// linked by a 1px rule) and a collapsible header/body. The rail primitives live
// in ./TimelineRow; the subagent card in ./SubagentCard; the body animates open
// (./Collapse, height spring) and renders via ./ToolOutput (syntax-highlighted
// code/json when detected, plain text otherwise). Formatting + detection live in
// ./format and ./detect.
import { type ReactNode, useState } from 'react'

import { IconLoader2, IconPackage } from '@tabler/icons-react'

import { cn } from '@/client/lib/cn'
import { formatMcpServerName, getMcpIcon } from '@/client/lib/mcp-icons'
import type { Part, ToolCall } from '@/lib/types'

import { Collapse } from './Collapse'
import { ReadImagePreview, readImageRelPath } from './ReadImagePreview'
import { SubagentCard } from './SubagentCard'
import {
  HEADER,
  IconMarker,
  McpLogo,
  RowChevron,
  type RowPosition,
  TimelineRow
} from './TimelineRow'
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

type ToolRowProps = RowPosition & {
  call: ToolCall
  leading?: ReactNode
  marker?: ReactNode
  name: string
  brief: string
  // Extra expanded content rendered above the output (e.g. the image a Read
  // tool call opened).
  preview?: ReactNode
}
function ToolRow({ isFirst, isLast, call, leading, marker, name, brief, preview }: ToolRowProps) {
  const [open, setOpen] = useState(false)
  const isError = call.state === 'error'
  const isRunning = call.state === 'running' || call.state === 'pending'
  const output = isError
    ? (call.errorText ?? '')
    : typeof call.output === 'string'
      ? call.output
      : ''
  const hasBody = !!(output || isError || preview)
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
          {brief && (
            <span className="min-w-0 self-baseline truncate text-[12px] text-ring">{brief}</span>
          )}
          {/* Dotted rows spin at the node instead; only icon (MCP) rows, whose
              node can't spin, keep a header spinner. */}
          {isRunning && marker && (
            <IconLoader2 size={12} stroke={1.5} className="shrink-0 animate-spin text-ring" />
          )}
          {hasBody && <RowChevron open={open} />}
        </button>
        {hasBody && (
          <Collapse open={open}>
            <div className="mt-1 mb-1 flex flex-col gap-1.5">
              {preview}
              {(output || isError) && <ToolOutput call={call} output={output} isError={isError} />}
            </div>
          </Collapse>
        )}
      </div>
    </TimelineRow>
  )
}

// Reasoning row — collapsible thought text as italic prose. Labelled "Thinking"
// while live (spinner node), "Thought" once done (dot node). No leading glyph.
// While live (`inProgress` — the last row of an active stream) it stays expanded
// so the streaming thought is visible; it collapses on its own the moment
// anything follows it (a text/tool row makes it no longer the last row, so
// `inProgress` goes false and it reverts to the user's collapsed default).
type ReasoningRowProps = RowPosition & { text: string; inProgress?: boolean }
function ReasoningRow({ isFirst, isLast, text, inProgress = false }: ReasoningRowProps) {
  const [open, setOpen] = useState(false)
  const label = inProgress ? 'Thinking' : 'Thought'
  const expanded = inProgress || open
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
          <RowChevron open={expanded} />
        </button>
        <Collapse open={expanded}>
          <div className="mt-1 mb-1 pr-2 text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
            {text}
          </div>
        </Collapse>
      </div>
    </TimelineRow>
  )
}

// Dispatch a tool call to the right row chrome: a subagent card for an Agent
// call, a "Loading Skill" row for a Skill call, the server-branded card for an
// MCP shape (`mcporter call …` Bash or a native `mcp__server__tool` name), else a
// plain tool row.
type ToolCallCardProps = RowPosition & { call: ToolCall; cwd: string | null }
function ToolCallCard({ call, cwd, isFirst, isLast }: ToolCallCardProps) {
  if (call.caller === 'subagent') {
    return <SubagentCard call={call} cwd={cwd} isFirst={isFirst} isLast={isLast} />
  }
  if (call.name === 'Skill' && call.skill) {
    // On success, swap the timeline dot for a package icon node (same box as the
    // MCP logo). Running keeps the spinner node; an error keeps the red dot.
    const succeeded = call.state === 'success'
    return (
      <ToolRow
        isFirst={isFirst}
        isLast={isLast}
        call={call}
        marker={succeeded ? <IconMarker icon={IconPackage} size={14} stroke={1.75} /> : undefined}
        name="Loading Skill"
        brief={call.skill.skillName}
      />
    )
  }
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
  // A Read of a workspace image gets the actual picture in its expanded body
  // (skipped while errored — the file likely wasn't readable).
  const imageRelPath = call.state === 'error' ? null : readImageRelPath(call, cwd)
  return (
    <ToolRow
      isFirst={isFirst}
      isLast={isLast}
      call={call}
      leading={<CallerBadge call={call} />}
      name={getToolDisplayName(call)}
      brief={formatInputBrief(call, cwd)}
      preview={imageRelPath ? <ReadImagePreview relPath={imageRelPath} /> : undefined}
    />
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
