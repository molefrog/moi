import { useEffect, useMemo, useState } from 'react'

import { IconCheck, IconCopy } from '@tabler/icons-react'

import { cn } from '@/client/lib/cn'
import type { ToolCall } from '@/lib/types'

import { Button } from '@/client/components/ui/button'
import { MarkdownContent } from '@/client/features/chat/messages/MarkdownContent'
import { CodeBlock } from './CodeBlock'
import { type DiffLine, detectOutput } from './detect'

type ToolOutputProps = { call: ToolCall; output: string; isError: boolean }

const PRE = 'max-h-[280px] overflow-auto px-3 py-2.5 font-mono text-xs leading-relaxed'

// Renders a tool result, choosing a view from `detectOutput`: a syntax-
// highlighted code/json block (with a raw ↔ formatted switch), or plain text.
export function ToolOutput({ call, output, isError }: ToolOutputProps) {
  const [raw, setRaw] = useState(false)
  // Detection runs JSON.parse/stringify — memoize so toggling raw/json (or any
  // re-render) doesn't re-detect. Errors always render as plain red text.
  const view = useMemo(
    () => (isError ? ({ kind: 'plain' } as const) : detectOutput(call, output)),
    [call, output, isError]
  )

  if (view.kind === 'empty') return null

  if (view.kind === 'plain') {
    return (
      <div
        className={cn(
          'rounded-lg border',
          isError ? 'border-destructive/30 bg-destructive/10' : 'border-border bg-muted'
        )}
      >
        <pre
          className={cn(
            PRE,
            'wrap-break-word whitespace-pre-wrap',
            isError ? 'text-destructive' : 'text-muted-foreground'
          )}
        >
          {output || '(empty)'}
        </pre>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-muted">
      {/* Size is always the raw output; copy grabs whatever's currently shown. */}
      <Header raw={raw} onRaw={setRaw} label={view.label} copyText={raw ? output : view.code} />
      {raw ? (
        <pre className={cn(PRE, 'wrap-break-word whitespace-pre-wrap text-muted-foreground')}>
          {output || '(empty)'}
        </pre>
      ) : view.kind === 'diff' ? (
        <DiffBlock lines={view.lines} />
      ) : view.kind === 'text' ? (
        <pre className={cn(PRE, 'wrap-break-word whitespace-pre-wrap text-muted-foreground')}>
          {view.code}
        </pre>
      ) : view.kind === 'markdown' ? (
        <div className="max-h-[280px] overflow-auto px-3 py-2.5 text-muted-foreground">
          <MarkdownContent size="xs" content={view.code} />
        </div>
      ) : (
        <CodeBlock code={view.code} className={cn(PRE, 'text-muted-foreground')} />
      )}
    </div>
  )
}

type DiffBlockProps = { lines: DiffLine[] }

// Added and removed lines carry a sign column and the success/destructive
// tint, so the change reads without relying on color alone.
function DiffBlock({ lines }: DiffBlockProps) {
  return (
    <pre className="max-h-[280px] overflow-auto py-2.5 font-mono text-xs leading-relaxed">
      {lines.map((line, index) => (
        <div
          key={index}
          className={cn(
            'flex px-3 wrap-break-word whitespace-pre-wrap',
            line.kind === 'addition' && 'bg-success/10 text-success',
            line.kind === 'deletion' && 'bg-destructive/10 text-destructive',
            line.kind === 'context' && 'text-muted-foreground'
          )}
        >
          <span className="w-4 shrink-0 select-none">
            {line.kind === 'addition' ? '+' : line.kind === 'deletion' ? '-' : ' '}
          </span>
          <span className="min-w-0 flex-1">{line.text || ' '}</span>
        </div>
      ))}
    </pre>
  )
}

type HeaderProps = {
  raw: boolean
  onRaw: (raw: boolean) => void
  label: string
  copyText: string
}

// Output toolbar: a left outline switch (<label> | raw), and on the right the
// raw byte size + a copy button.
function Header({ raw, onRaw, label, copyText }: HeaderProps) {
  const options: [boolean, string][] = [
    [false, label],
    [true, 'raw']
  ]
  return (
    <div className="flex items-center gap-1 border-b border-border p-2">
      {options.map(([value, text]) => (
        <Button
          key={text}
          type="button"
          variant={raw === value ? 'outline' : 'ghost'}
          size="sm"
          onClick={() => onRaw(value)}
          className="rounded-full text-xs uppercase"
        >
          {text}
        </Button>
      ))}
      <div className="flex-1" />
      <CopyButton text={copyText} />
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  // Revert the check after a moment; cleanup cancels it if the row collapses.
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(t)
  }, [copied])

  const copy = () => {
    navigator.clipboard
      ?.writeText(text)
      .then(() => setCopied(true))
      .catch(() => {})
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={copy}
      aria-label={copied ? 'Copied' : 'Copy'}
    >
      {copied ? <IconCheck stroke={1.75} /> : <IconCopy stroke={1.75} />}
    </Button>
  )
}
