import { memo } from 'react'

import { IconFile } from '@tabler/icons-react'

import { MarkdownContent } from '@/client/features/chat/MarkdownContent'
import { ToolCallGroup } from '@/client/features/chat/tool-group/ToolCallGroup'
import { useWorkspaceLayoutCtx } from '@/client/features/workspace/WorkspaceLayoutContext'
import type { Part, Turn } from '@/lib/types'

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

// A part either folds into a tool-group "run" (reasoning + tool calls — including
// subagents and skills, which render as their own timeline rows) or stands alone
// (text, files, sources, data).
function isRunPart(part: Part): boolean {
  if (part.type === 'reasoning') return true
  if (part.type === 'tool-call') return true
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

type TurnPartsProps = { parts: Part[]; cwd: string | null; processing?: boolean }

// Shared body renderer for a sequence of parts — used by both a finalized turn
// and the live streaming preview turn (see client/lib/preview-turn.ts), so a
// streamed message and its finalized form render identically. Consecutive
// reasoning + tool-call parts fold into one <ToolCallGroup> run; text/files/etc.
// stand alone. `processing` flows into the LAST run so a trailing reasoning there
// reads as a live, expanded "Thinking" row.
export function TurnParts({ parts, cwd, processing = false }: TurnPartsProps) {
  const segments = buildSegments(parts)
  return (
    <div className="flex flex-col">
      {segments.map((seg, i) => {
        const spacing = i === 0 ? '' : 'mt-3'
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

type TurnViewProps = { turn: Turn; processing?: boolean }

// Memoized: the message list maps over grouped turns (stable identities — see
// `groupTurns` in ChatPanel), so parent re-renders only update rows whose `turn`
// or `processing` actually changed.
export const TurnView = memo(function TurnView({ turn, processing = false }: TurnViewProps) {
  const cwd = useWorkspaceLayoutCtx().cwd

  if (turn.origin.kind === 'replay') return null

  // The SKILL.md body is captured as the owning Skill tool call's `skill.body`
  // and not surfaced in the scroll. Other synthetic turns (system reminders,
  // hook output) and subagent prompts stay hidden by default.
  if (turn.origin.kind === 'synthetic') return null
  if (turn.origin.kind === 'subagent-prompt') return null

  if (turn.role === 'user' && turn.origin.kind === 'user-input') {
    // Plain user input — right-aligned. Attachments (images/files) stack above
    // the text bubble.
    const fileParts = turn.parts.filter(
      (p): p is Extract<Part, { type: 'file' }> => p.type === 'file'
    )
    const text = turn.parts
      .filter(p => p.type === 'text')
      .map(p => (p.type === 'text' ? p.text : ''))
      .join('\n')
    if (!text && fileParts.length === 0) return null
    return (
      <div className="ml-8 flex min-w-0 flex-col items-end gap-1.5">
        {fileParts.map((p, i) => (
          <FilePart key={i} mediaType={p.mediaType} url={p.url} filename={p.filename} />
        ))}
        {text && (
          <p className="max-w-full min-w-0 rounded-md bg-accent px-4 py-2 text-sm leading-normal wrap-anywhere whitespace-pre-wrap text-accent-foreground">
            {text}
          </p>
        )}
      </div>
    )
  }

  return <TurnParts parts={turn.parts} cwd={cwd} processing={processing} />
})

type PartRendererProps = { part: Part }

// Renders the standalone parts. Reasoning + tool calls never reach here — they're
// folded into a <ToolCallGroup> run by buildSegments.
function PartRenderer({ part }: PartRendererProps) {
  switch (part.type) {
    case 'text':
      return <MarkdownContent content={part.text} />
    case 'tool-call':
      // Tool calls normally fold into a run; this is a defensive fallback for a
      // lone tool-call segment, rendered as a one-row group.
      return <ToolCallGroup parts={[part]} cwd={null} />
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

type FilePartProps = { mediaType: string; url: string; filename?: string }
function FilePart({ mediaType, url, filename }: FilePartProps) {
  // Images (data/object/remote URLs) render as a thumbnail; everything else is a
  // labelled chip. A file with no usable url (e.g. a non-image attachment whose
  // bytes live only server-side) still shows its name.
  if (mediaType.startsWith('image/') && url) {
    return (
      <img
        src={url}
        alt={filename ?? 'attachment'}
        className="max-h-64 max-w-full rounded-md border border-border object-contain"
      />
    )
  }
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-border bg-accent px-2.5 py-1.5 text-xs text-accent-foreground">
      <IconFile size={16} stroke={1.75} />
      <span className="truncate">{filename ?? mediaType}</span>
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
