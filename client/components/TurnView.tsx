import { useState } from 'react'

import {
  IconAlertTriangle,
  IconBrain,
  IconChevronRight,
  IconLoader2,
  IconSparkles,
  IconUsersGroup,
  IconX
} from '@tabler/icons-react'
import { relative } from 'pathe'

import { MarkdownContent } from '@/client/components/MarkdownContent'
import { cn } from '@/client/lib/cn'
import { useWorkspaceStore } from '@/client/store/workspace'
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
          className="bg-ring block h-1.5 w-1.5 rounded-full"
          style={{
            animation: 'pulse-dot 1.4s ease-in-out infinite',
            animationDelay: `${i * 0.2}s`
          }}
        />
      ))}
    </div>
  )
}

type TurnViewProps = { turn: Turn }

export function TurnView({ turn }: TurnViewProps) {
  if (turn.origin.kind === 'replay') return null

  // The SKILL.md body is captured as the owning Skill tool call's `skill.body`
  // and not surfaced in the scroll (see ClaudeAdapter). Other synthetic turns
  // (system reminders, hook output) stay hidden by default.
  if (turn.origin.kind === 'synthetic') return null
  if (turn.origin.kind === 'subagent-prompt') return null

  if (turn.role === 'user' && turn.origin.kind === 'user-input') {
    // Plain user input — right-aligned bubble (only text is typical here)
    const text = turn.parts
      .filter(p => p.type === 'text')
      .map(p => (p.type === 'text' ? p.text : ''))
      .join('\n')
    if (!text) return null
    return (
      <p className="ml-8 self-end whitespace-pre-wrap rounded-md bg-black/[0.07] px-4 py-2 text-sm leading-normal">
        {text}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {turn.parts.map((part, i) => (
        <PartRenderer key={i} part={part} />
      ))}
    </div>
  )
}

type PartRendererProps = { part: Part }

function PartRenderer({ part }: PartRendererProps) {
  switch (part.type) {
    case 'text':
      return <MarkdownContent content={part.text} />
    case 'reasoning':
      return <ReasoningPart text={part.text} redacted={part.redacted} />
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
  }
}

type ReasoningPartProps = { text: string; redacted?: boolean }
function ReasoningPart({ text, redacted }: ReasoningPartProps) {
  const [open, setOpen] = useState(false)
  return (
    <details
      className="group"
      open={open}
      onToggle={e => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="text-muted-foreground flex cursor-pointer select-none items-center gap-2 py-1 text-xs">
        <IconChevronRight
          size={12}
          stroke={1.5}
          className="chevron transition-transform duration-150 group-open:rotate-90"
        />
        <IconBrain size={12} stroke={1.5} />
        <span>{redacted ? 'Redacted thinking' : 'Thinking'}</span>
      </summary>
      {!redacted && (
        <div className="text-muted-foreground ml-4 mt-1 whitespace-pre-wrap text-xs italic leading-relaxed">
          {text}
        </div>
      )}
    </details>
  )
}

type FilePartProps = { mediaType: string; url: string; filename?: string }
function FilePart({ mediaType, url, filename }: FilePartProps) {
  return (
    <div className="text-muted-foreground text-xs">
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
      <summary className="text-muted-foreground cursor-pointer text-xs">data:{name}</summary>
      <pre className="bg-muted text-muted-foreground mt-1 overflow-auto rounded p-2 text-xs">
        {JSON.stringify(data, null, 2)}
      </pre>
    </details>
  )
}

// -----------------------------------------------------------------------
// Tool call cards
// -----------------------------------------------------------------------

type ToolCallCardProps = { call: ToolCall }

function ToolCallCard({ call }: ToolCallCardProps) {
  if (call.caller === 'subagent' && call.subagent) {
    return <SubagentCard call={call} subagent={call.subagent} />
  }
  if (call.name === 'Skill' && call.skill) {
    return <SkillCard call={call} />
  }
  return <GenericToolCard call={call} />
}

type GenericToolCardProps = { call: ToolCall }
function GenericToolCard({ call }: GenericToolCardProps) {
  const cwd = useWorkspaceStore(s => s.cwd)
  const isError = call.state === 'error'
  const isRunning = call.state === 'running' || call.state === 'pending'
  const output = isError
    ? (call.errorText ?? '')
    : typeof call.output === 'string'
      ? call.output
      : ''

  return (
    <details className="group">
      <summary className="flex cursor-pointer select-none items-center gap-2 py-1.5">
        <IconChevronRight
          size={12}
          stroke={1.5}
          className="chevron text-ring shrink-0 transition-transform duration-150 group-open:rotate-90"
        />
        <CallerBadge call={call} />
        <span className="text-xs font-medium">{call.name}</span>
        <span className="text-ring truncate text-[11px]">
          {formatInputBrief(call.name, (call.input as Record<string, unknown>) ?? {}, cwd)}
        </span>
        {isRunning && <IconLoader2 size={12} stroke={1.5} className="text-ring animate-spin" />}
      </summary>
      {(output || isError) && (
        <div
          className={cn(
            'ml-4 mt-1 rounded-md border px-3 py-2.5',
            isError ? 'border-red-200 bg-red-50' : 'border-border bg-muted'
          )}
        >
          <pre
            className={cn(
              'max-h-[200px] overflow-y-auto whitespace-pre-wrap break-all font-mono text-xs leading-relaxed',
              isError ? 'text-red-800' : 'text-muted-foreground'
            )}
          >
            {output || '(empty)'}
          </pre>
        </div>
      )}
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
        {isRunning && <IconLoader2 size={12} stroke={1.5} className="text-ring animate-spin" />}
        {isError && <IconAlertTriangle size={12} stroke={1.5} className="text-red-600" />}
        {body && (
          <button
            type="button"
            onClick={() => setShowBody(v => !v)}
            className="text-muted-foreground text-[11px] underline"
          >
            {showBody ? 'hide' : 'show'} instructions
          </button>
        )}
      </div>
      {showBody && body && (
        <pre className="bg-muted text-muted-foreground max-h-[300px] overflow-y-auto whitespace-pre-wrap rounded p-3 font-mono text-xs leading-relaxed">
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
    running: <IconLoader2 size={12} stroke={1.5} className="text-ring animate-spin" />,
    completed: <span className="text-xs text-emerald-700">✓</span>,
    failed: <IconAlertTriangle size={12} stroke={1.5} className="text-red-600" />,
    stopped: <IconX size={12} stroke={1.5} className="text-muted-foreground" />
  }[status]

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border-border bg-muted/40 hover:bg-muted/70 flex items-center gap-2 rounded-md border px-3 py-2 text-left transition-colors"
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
            <div className="text-muted-foreground mt-0.5 truncate text-[11px]">{latest}</div>
          )}
          {status !== 'running' && subagent.usage?.toolUses != null && (
            <div className="text-muted-foreground mt-0.5 text-[11px]">
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
        className="bg-background flex max-h-[80vh] w-[min(800px,100%)] flex-col overflow-hidden rounded-lg shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <header className="border-border flex items-start justify-between gap-3 border-b px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <IconUsersGroup size={16} stroke={1.5} className="text-blue-600" />
              <h3 className="text-sm font-semibold">{subagent.description || 'Subagent task'}</h3>
            </div>
            <div className="text-muted-foreground mt-0.5 text-[11px]">
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
          <aside className="border-border w-52 shrink-0 border-r pr-4">
            <div className="text-muted-foreground mb-2 text-[11px] font-medium uppercase">
              Progress
            </div>
            <ol className="flex flex-col gap-1">
              {subagent.progress.map((p, i) => (
                <li key={i} className="text-muted-foreground truncate text-[11px]">
                  {i + 1}. {p}
                </li>
              ))}
            </ol>
          </aside>

          <div className="flex flex-1 flex-col gap-4 overflow-y-auto pr-2">
            {call.input != null && Object.keys(call.input as object).length > 0 && (
              <details>
                <summary className="text-muted-foreground cursor-pointer text-[11px]">
                  Prompt
                </summary>
                <pre className="bg-muted text-muted-foreground mt-1 whitespace-pre-wrap rounded p-2 font-mono text-xs">
                  {JSON.stringify(call.input, null, 2)}
                </pre>
              </details>
            )}
            {subagent.transcript.length === 0 ? (
              <div className="text-muted-foreground text-xs">No nested transcript captured.</div>
            ) : (
              subagent.transcript.map(nested => <TurnView key={nested.id} turn={nested} />)
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

type CallerBadgeProps = { call: ToolCall }
function CallerBadge({ call }: CallerBadgeProps) {
  if (call.caller === 'mcp') {
    return (
      <span className="border-border text-muted-foreground rounded border px-1 text-[9px] uppercase">
        mcp{call.mcpServer ? `:${call.mcpServer.slice(0, 8)}` : ''}
      </span>
    )
  }
  if (call.caller === 'server-tool') {
    return (
      <span className="border-border text-muted-foreground rounded border px-1 text-[9px] uppercase">
        server
      </span>
    )
  }
  return null
}

// -----------------------------------------------------------------------
// Tool-input formatting
// -----------------------------------------------------------------------

function getInputValue(input: Record<string, unknown>, key: string): string {
  const value = input[key]
  return typeof value === 'string' ? value : ''
}

function makeShortenPaths(cwd: string | null) {
  return (s: string) =>
    s.replace(/\/[^\s"']+/g, p => {
      if (!cwd) return p
      const rel = relative(cwd, p)
      return rel.startsWith('..') ? p : rel
    })
}

function formatInputBrief(
  tool: string,
  input: Record<string, unknown>,
  cwd: string | null
): string {
  const shorten = makeShortenPaths(cwd)
  if (tool === 'Bash') return shorten(`$ ${getInputValue(input, 'command')}`)
  if (tool === 'Read') return shorten(getInputValue(input, 'file_path'))
  if (tool === 'Write' || tool === 'Edit') return shorten(getInputValue(input, 'file_path'))
  if (tool === 'Glob') return shorten(getInputValue(input, 'pattern'))
  if (tool === 'Grep')
    return `/${getInputValue(input, 'pattern')}/ ${shorten(getInputValue(input, 'path'))}`
  if (tool === 'update_plan') {
    const plan = input.plan
    if (Array.isArray(plan)) {
      const inProgress = plan.find(
        (p): p is { step: string } =>
          !!p && typeof p === 'object' && (p as { status?: unknown }).status === 'in_progress'
      )
      const step = inProgress?.step ?? (plan[0] as { step?: unknown })?.step
      if (typeof step === 'string') return step
    }
    return ''
  }
  return ''
}
