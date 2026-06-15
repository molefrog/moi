import { useState } from 'react'

import {
  IconAlertTriangle,
  IconLoader2,
  IconSparkles,
  IconUsersGroup,
  IconX
} from '@tabler/icons-react'

import { MarkdownContent } from '@/client/components/MarkdownContent'
import { ToolCallGroup } from '@/client/components/tool-group/ToolCallGroup'
import { useWorkspaceLayoutCtx } from '@/client/lib/WorkspaceLayoutContext'
import type { Part, SubagentRecord, ToolCall, Turn } from '@/lib/types'

export function EmptyState() {
  return <div className="flex flex-1 flex-col items-center justify-center" />
}

export function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-1 py-3">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="block h-1.5 w-1.5 rounded-full bg-ring"
          style={{
            animation: 'pulse-dot 1.4s ease-in-out infinite',
            animationDelay: `${i * 0.2}s`
          }}
        />
      ))}
    </div>
  )
}

// A part either folds into a tool-group "run" (reasoning + ordinary tool calls,
// rendered as one connected timeline) or stands alone (text, files, sources, and
// the special subagent/skill cards, which own their own layout/modal).
function isRunPart(part: Part): boolean {
  if (part.type === 'reasoning') return true
  if (part.type === 'tool-call') {
    const c = part.call
    if (c.caller === 'subagent' && c.subagent) return false
    if (c.name === 'Skill' && c.skill) return false
    return true
  }
  return false
}

type Segment = { kind: 'run'; parts: Part[] } | { kind: 'single'; part: Part }

// Split a turn's parts into runs (consecutive run-parts) and singles, preserving
// order. Each run becomes one <ToolCallGroup>; singles render individually.
function buildSegments(parts: Part[]): Segment[] {
  const segments: Segment[] = []
  for (const part of parts) {
    if (isRunPart(part)) {
      const last = segments[segments.length - 1]
      if (last && last.kind === 'run') last.parts.push(part)
      else segments.push({ kind: 'run', parts: [part] })
    } else {
      segments.push({ kind: 'single', part })
    }
  }
  return segments
}

type TurnViewProps = { turn: Turn; processing?: boolean }

export function TurnView({ turn, processing = false }: TurnViewProps) {
  const cwd = useWorkspaceLayoutCtx().cwd

  if (turn.origin.kind === 'replay') return null

  // The SKILL.md body is captured as the owning Skill tool call's `skill.body`
  // and not surfaced in the scroll. Other synthetic turns (system reminders,
  // hook output) and subagent prompts stay hidden by default.
  if (turn.origin.kind === 'synthetic') return null
  if (turn.origin.kind === 'subagent-prompt') return null

  if (turn.role === 'user' && turn.origin.kind === 'user-input') {
    // Plain user input — right-aligned bubble (only text is typical here).
    const text = turn.parts
      .filter(p => p.type === 'text')
      .map(p => (p.type === 'text' ? p.text : ''))
      .join('\n')
    if (!text) return null
    return (
      <p className="ml-8 self-end rounded-md bg-black/[0.07] px-4 py-2 text-sm leading-normal whitespace-pre-wrap">
        {text}
      </p>
    )
  }

  const segments = buildSegments(turn.parts)
  return (
    <div className="flex flex-col">
      {segments.map((seg, i) => {
        const spacing = i === 0 ? '' : 'mt-3'
        // `processing` belongs to the live last row, so only flow it into the
        // final run — a trailing reasoning there reads as "Thinking".
        const isLast = i === segments.length - 1
        return (
          <div key={i} className={spacing}>
            {seg.kind === 'run' ? (
              <ToolCallGroup parts={seg.parts} cwd={cwd} processing={processing && isLast} />
            ) : (
              <PartRenderer part={seg.part} />
            )}
          </div>
        )
      })}
    </div>
  )
}

type PartRendererProps = { part: Part }

// Renders the standalone parts. Reasoning + ordinary tool calls never reach here
// — they're folded into a <ToolCallGroup> run by buildSegments.
function PartRenderer({ part }: PartRendererProps) {
  switch (part.type) {
    case 'text':
      return <MarkdownContent content={part.text} />
    case 'tool-call':
      return <ToolCallCard call={part.call} />
    case 'file':
      return <FilePart mediaType={part.mediaType} url={part.url} filename={part.filename} />
    case 'source-url':
      return <SourceLink url={part.url} title={part.title} />
    case 'source-document':
      return <SourceLink url="#" title={part.title} />
    case 'data':
      return <DataPart name={part.name} data={part.data} />
    case 'reasoning':
      return null
  }
}

// Only the special cards reach here (subagent, skill); ordinary tools render in a
// ToolCallGroup run. The trailing fallback keeps an unexpected tool visible.
function ToolCallCard({ call }: { call: ToolCall }) {
  if (call.caller === 'subagent' && call.subagent)
    return <SubagentCard call={call} subagent={call.subagent} />
  if (call.name === 'Skill' && call.skill) return <SkillCard call={call} />
  return <ToolCallGroup parts={[{ type: 'tool-call', call }]} cwd={null} />
}

type FilePartProps = { mediaType: string; url: string; filename?: string }
function FilePart({ mediaType, url, filename }: FilePartProps) {
  return (
    <div className="text-xs text-muted-foreground">
      📎 {filename ?? url} ({mediaType})
    </div>
  )
}

type SourceLinkProps = { url: string; title?: string }
function SourceLink({ url, title }: SourceLinkProps) {
  return (
    <a href={url} target="_blank" rel="noreferrer" className="text-xs underline">
      {title ?? url}
    </a>
  )
}

type DataPartProps = { name: string; data: unknown }
function DataPart({ name, data }: DataPartProps) {
  return (
    <details>
      <summary className="cursor-pointer text-xs text-muted-foreground">data:{name}</summary>
      <pre className="mt-1 overflow-auto rounded bg-muted p-2 text-xs text-muted-foreground">
        {JSON.stringify(data, null, 2)}
      </pre>
    </details>
  )
}

type SkillCardProps = { call: ToolCall }
function SkillCard({ call }: SkillCardProps) {
  const [showBody, setShowBody] = useState(false)
  const skillName = call.skill?.skillName ?? 'unknown'
  const body = call.skill?.body ?? ''
  const isRunning = call.state === 'running'
  const isError = call.state === 'error'

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 py-1">
        <IconSparkles size={14} stroke={1.5} className="text-amber-600" />
        <span className="text-xs font-medium">
          Loading skill <span className="font-mono">{skillName}</span>
        </span>
        {isRunning && <IconLoader2 size={12} stroke={1.5} className="animate-spin text-ring" />}
        {isError && <IconAlertTriangle size={12} stroke={1.5} className="text-red-600" />}
        {body && (
          <button
            type="button"
            onClick={() => setShowBody(v => !v)}
            className="text-[11px] text-muted-foreground underline"
          >
            {showBody ? 'hide' : 'show'} instructions
          </button>
        )}
      </div>
      {showBody && body && (
        <pre className="max-h-[300px] overflow-y-auto rounded bg-muted p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
          {body}
        </pre>
      )}
    </div>
  )
}

type SubagentCardProps = { call: ToolCall; subagent: SubagentRecord }

function SubagentCard({ call, subagent }: SubagentCardProps) {
  const [open, setOpen] = useState(false)
  const status = subagent.status
  const latest =
    status === 'running' && subagent.progress.length > 0
      ? subagent.progress[subagent.progress.length - 1]
      : null

  const statusBadge = {
    running: <IconLoader2 size={12} stroke={1.5} className="animate-spin text-ring" />,
    completed: <span className="text-xs text-emerald-700">✓</span>,
    failed: <IconAlertTriangle size={12} stroke={1.5} className="text-red-600" />,
    stopped: <IconX size={12} stroke={1.5} className="text-muted-foreground" />
  }[status]

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-left transition-colors hover:bg-muted/70"
      >
        <IconUsersGroup size={14} stroke={1.5} className="shrink-0 text-blue-600" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-xs font-medium">
              {subagent.description || 'Subtask'}
            </span>
            {statusBadge}
          </div>
          {latest && (
            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{latest}</div>
          )}
          {status !== 'running' && subagent.usage?.toolUses != null && (
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {subagent.usage.toolUses} tool call{subagent.usage.toolUses === 1 ? '' : 's'}
            </div>
          )}
        </div>
      </button>
      {open && <SubagentModal call={call} subagent={subagent} onClose={() => setOpen(false)} />}
    </>
  )
}

type SubagentModalProps = {
  call: ToolCall
  subagent: SubagentRecord
  onClose: () => void
}

function SubagentModal({ call, subagent, onClose }: SubagentModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-[min(800px,100%)] flex-col overflow-hidden rounded-lg bg-background shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <IconUsersGroup size={16} stroke={1.5} className="text-blue-600" />
              <h3 className="text-sm font-semibold">{subagent.description || 'Subagent task'}</h3>
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              status: {subagent.status}
              {subagent.usage?.durationMs != null &&
                ` · ${Math.round(subagent.usage.durationMs / 1000)}s`}
              {subagent.usage?.totalTokens != null && ` · ${subagent.usage.totalTokens} tokens`}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <IconX size={18} stroke={1.5} />
          </button>
        </header>

        <div className="flex flex-1 gap-4 overflow-hidden px-5 py-4">
          <aside className="w-52 shrink-0 border-r border-border pr-4">
            <div className="mb-2 text-[11px] font-medium text-muted-foreground uppercase">
              Progress
            </div>
            <ol className="flex flex-col gap-1">
              {subagent.progress.map((p, i) => (
                <li key={i} className="truncate text-[11px] text-muted-foreground">
                  {i + 1}. {p}
                </li>
              ))}
            </ol>
          </aside>

          <div className="flex flex-1 flex-col gap-4 overflow-y-auto pr-2">
            {call.input != null && Object.keys(call.input as object).length > 0 && (
              <details>
                <summary className="cursor-pointer text-[11px] text-muted-foreground">
                  Prompt
                </summary>
                <pre className="mt-1 rounded bg-muted p-2 font-mono text-xs whitespace-pre-wrap text-muted-foreground">
                  {JSON.stringify(call.input, null, 2)}
                </pre>
              </details>
            )}
            {subagent.transcript.length === 0 ? (
              <div className="text-xs text-muted-foreground">No nested transcript captured.</div>
            ) : (
              subagent.transcript.map(nested => <TurnView key={nested.id} turn={nested} />)
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
