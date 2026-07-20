import { useEffect, useMemo, useState } from 'react'

import { IconCheck, IconCopy } from '@tabler/icons-react'

import { cn } from '@/client/lib/cn'
import type { ToolCall } from '@/lib/types'

import { Button } from '@/client/components/ui/button'
import { CodeBlock } from './CodeBlock'
import { detectOutput } from './detect'

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
          isError ? 'border-destructive/30 bg-destructive/10' : 'border-border bg-muted'
        )}
      >
        <pre
          className={cn(
            PRE,
            'break-all whitespace-pre-wrap',
            isError ? 'text-destructive' : 'text-muted-foreground'
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
      <Header raw={raw} onRaw={setRaw} label={view.label} copyText={raw ? output : view.code} />
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
