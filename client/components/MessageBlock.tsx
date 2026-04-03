import { IconChevronRight } from '@tabler/icons-react'
import { relative } from 'pathe'

import { MarkdownContent } from '@/client/components/MarkdownContent'
import { cn } from '@/client/lib/cn'
import { useWorkspaceStore } from '@/client/store/workspace'
import type { ChatMessage } from '@/lib/types'

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

type MessageBlockProps = {
  msg: ChatMessage
  messages: ChatMessage[]
  index: number
}

export function MessageBlock({ msg, messages, index }: MessageBlockProps) {
  const cwd = useWorkspaceStore(s => s.cwd)
  switch (msg.type) {
    case 'user':
      return (
        <p className="ml-8 self-end whitespace-pre-wrap rounded-md bg-black/[0.07] px-4 py-2 text-sm leading-normal">
          {msg.content}
        </p>
      )

    case 'assistant':
      return <MarkdownContent content={msg.content} />

    case 'tool_use': {
      const result = messages[index + 1]
      const hasResult = result?.type === 'tool_result'
      const isError = hasResult && result.is_error
      const resultContent = hasResult ? result.content : ''

      return (
        <details className="group">
          <summary className="flex cursor-pointer select-none items-center gap-2 py-1.5">
            <IconChevronRight
              size={12}
              stroke={1.5}
              className="chevron text-ring transition-transform duration-150"
            />
            <span className="text-xs font-medium">{msg.name}</span>
            <span className="text-ring truncate text-[11px]">
              {formatInputBrief(msg.name, msg.input, cwd)}
            </span>
          </summary>
          {hasResult && (
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
                {resultContent || '(empty)'}
              </pre>
            </div>
          )}
        </details>
      )
    }

    case 'tool_result':
      return null

    case 'done':
    case 'stopped':
      return null

    case 'error':
      return (
        <div className="my-1 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
          {msg.content}
        </div>
      )
  }
}

function getInputValue(input: Record<string, unknown>, key: string): string {
  const value = input[key]
  return typeof value === 'string' ? value : ''
}

// Returns a function that shortens absolute paths in a string relative to cwd.
// e.g. cwd="/foo/bar", "/foo/bar/baz/file.ts" → "baz/file.ts"
// Fallback for paths outside cwd: show last 2 segments.
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
  return ''
}
