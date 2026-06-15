import { useEffect, useMemo, useState } from 'react'

import { IconCheck, IconCopy } from '@tabler/icons-react'

import { cn } from '@/client/lib/cn'
import type { ToolCall } from '@/lib/types'

import { CodeBlock } from './CodeBlock'
import { detectOutput } from './detect'
import { formatBytes } from './format'

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

  if (view.kind === 'plain') {
    return (
      <div
        className={cn(
          'rounded-md border',
          isError ? 'border-red-200 bg-red-50' : 'border-border bg-muted'
        )}
      >
        <pre
          className={cn(
            PRE,
            'break-all whitespace-pre-wrap',
            isError ? 'text-red-800' : 'text-muted-foreground'
          )}
        >
          {output || '(empty)'}
        </pre>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-md border border-border bg-muted">
      {/* Size is always the raw output; copy grabs whatever's currently shown. */}
      <Header
        raw={raw}
        onRaw={setRaw}
        label={view.label}
        size={formatBytes(output)}
        copyText={raw ? output : view.code}
      />
      {raw ? (
        <pre className={cn(PRE, 'break-all whitespace-pre-wrap text-muted-foreground')}>
          {output || '(empty)'}
        </pre>
      ) : (
        <CodeBlock code={view.code} className={cn(PRE, 'text-muted-foreground')} />
      )}
    </div>
  )
}

type HeaderProps = {
  raw: boolean
  onRaw: (raw: boolean) => void
  label: string
  size: string
  copyText: string
}

// Output toolbar: a left outline switch (<label> | raw), and on the right the
// raw byte size + a copy button.
function Header({ raw, onRaw, label, size, copyText }: HeaderProps) {
  const options: [boolean, string][] = [
    [false, label],
    [true, 'raw']
  ]
  return (
    <div className="flex items-center gap-1 border-b border-border px-2 py-1">
      {options.map(([value, text]) => (
        <button
          key={text}
          type="button"
          onClick={() => onRaw(value)}
          className={cn(
            'rounded-md px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase transition-colors',
            raw === value
              ? 'bg-background text-foreground shadow-[inset_0_0_0_1px_var(--border)]'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {text}
        </button>
      ))}
      <div className="flex-1" />
      <span className="text-[10px] font-medium text-muted-foreground tabular-nums">{size}</span>
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
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? 'Copied' : 'Copy'}
      className="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
    >
      {copied ? (
        <IconCheck size={13} stroke={1.5} className="text-foreground" />
      ) : (
        <IconCopy size={13} stroke={1.5} />
      )}
    </button>
  )
}
