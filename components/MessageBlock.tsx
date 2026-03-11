import React from 'react'

import { IconChevronRight, IconMessage } from '@tabler/icons-react'

import type { ChatMessage } from '../lib/types'
import { cn } from '../lib/cn'

export function EmptyState() {
  return (
    <div className="flex min-h-[60vh] flex-1 flex-col items-center justify-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-muted">
        <IconMessage size={20} className="text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground">Start a conversation with the agent</p>
    </div>
  )
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

export function MessageBlock({ msg, compact }: { msg: ChatMessage; compact?: boolean }) {
  switch (msg.type) {
    case 'user':
      return (
        <p className="ml-8 self-end rounded-md bg-black/[0.07] px-4 py-2 text-sm leading-normal wrap-break-word whitespace-pre-wrap">
          {msg.content}
        </p>
      )

    case 'assistant':
      return (
        <div className="prose-inline text-sm leading-normal wrap-break-word">
          <FormattedText text={msg.content} />
        </div>
      )

    case 'tool_use':
      return (
        <div className="my-0.5 ml-7 border-l-2 border-border pl-3">
          <details className="group">
            <summary className="flex cursor-pointer items-center gap-2 py-1.5 select-none">
              <IconChevronRight
                size={12}
                className="chevron text-ring transition-transform duration-150"
              />
              <span className="font-mono text-xs font-medium text-amber-800">{msg.name}</span>
              <span
                className={cn(
                  'truncate font-mono text-[11px] text-ring',
                  compact ? 'max-w-[200px]' : 'max-w-[400px]'
                )}
              >
                {formatInputBrief(msg.name, msg.input)}
              </span>
            </summary>
            <div className="mt-1 ml-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5">
              <pre className="max-h-[200px] overflow-y-auto font-mono text-xs leading-relaxed break-all whitespace-pre-wrap text-amber-800">
                {formatInput(msg.name, msg.input)}
              </pre>
            </div>
          </details>
        </div>
      )

    case 'tool_result':
      return (
        <div className="my-0.5 ml-7 border-l-2 border-border pl-3">
          {msg.is_error ? (
            <div className="ml-4 rounded-md border border-red-200 bg-red-50 px-3 py-2">
              <pre className="max-h-[160px] overflow-y-auto font-mono text-xs leading-relaxed break-all whitespace-pre-wrap text-red-800">
                {msg.content || '(empty)'}
              </pre>
            </div>
          ) : (
            <details className="group">
              <summary className="ml-4 flex cursor-pointer items-center gap-2 py-1 select-none">
                <IconChevronRight
                  size={12}
                  className="chevron text-ring transition-transform duration-150"
                />
                <span className="font-mono text-[11px] text-ring">
                  Result
                  {msg.content ? ` \u00B7 ${msg.content.length} chars` : ' \u00B7 empty'}
                </span>
              </summary>
              <div className="mt-1 ml-4 rounded-md border border-border bg-muted px-3 py-2.5">
                <pre className="max-h-[200px] overflow-y-auto font-mono text-xs leading-relaxed break-all whitespace-pre-wrap text-muted-foreground">
                  {msg.content || '(empty)'}
                </pre>
              </div>
            </details>
          )}
        </div>
      )

    case 'done':
    case 'stopped':
      return null

    case 'error':
      return (
        <div className="my-1 ml-7 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
          {msg.content}
        </div>
      )
  }
}

function FormattedText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return (
    <span className="whitespace-pre-wrap">
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={i} className="font-semibold">
              {part.slice(2, -2)}
            </strong>
          )
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <code key={i} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[13px]">
              {part.slice(1, -1)}
            </code>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </span>
  )
}

function getInputValue(input: Record<string, unknown>, key: string): string {
  const value = input[key]
  return typeof value === 'string' ? value : ''
}

function formatInputBrief(tool: string, input: Record<string, unknown>): string {
  if (tool === 'Bash') return `$ ${getInputValue(input, 'command')}`
  if (tool === 'Read') return getInputValue(input, 'file_path')
  if (tool === 'Write' || tool === 'Edit') return getInputValue(input, 'file_path')
  if (tool === 'Glob') return getInputValue(input, 'pattern')
  if (tool === 'Grep') return `/${getInputValue(input, 'pattern')}/ ${getInputValue(input, 'path')}`
  return ''
}

function formatInput(tool: string, input: Record<string, unknown>): string {
  if (tool === 'Bash') return `$ ${getInputValue(input, 'command')}`
  if (tool === 'Read') return getInputValue(input, 'file_path')
  if (tool === 'Write' || tool === 'Edit') return getInputValue(input, 'file_path')
  if (tool === 'Glob') return getInputValue(input, 'pattern')
  if (tool === 'Grep') return `/${getInputValue(input, 'pattern')}/ ${getInputValue(input, 'path')}`
  return JSON.stringify(input, null, 2)
}
