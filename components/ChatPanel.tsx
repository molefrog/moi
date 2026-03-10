import React, { useEffect, useRef } from 'react'

import { ChevronRight, Expand06, MessageChatCircle, XClose } from '@untitledui/icons'

import { cn } from '../shared/cn'
import type { ChatMessage } from '../shared/types'
import { ChatInput } from './ChatInput'
import { Button } from './ui/button'

type Message = ChatMessage
export type LayoutMode = 'centered' | 'sidebar' | 'popup'

type ChatPanelProps = {
  messages: Message[]
  input: string
  setInput: (v: string) => void
  processing: boolean
  send: () => void
  stop: () => void
  layoutMode: LayoutMode
  onCollapse?: () => void
  onExpand?: () => void
  onClose?: () => void
}

export function ChatPanel({
  messages,
  input,
  setInput,
  processing,
  send,
  stop,
  layoutMode,
  onCollapse,
  onExpand,
  onClose
}: ChatPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const isCentered = layoutMode === 'centered'

  return (
    <div className="flex h-full flex-col font-sans">
      {/* Header */}
      <header className="flex items-center justify-between pb-6">
        <h1 className={cn('text-ink text-xl leading-normal font-semibold tracking-tight')}>
          New chat
        </h1>
        <div className="flex items-center gap-2">
          {layoutMode === 'sidebar' && onCollapse && (
            <Button variant="ghost" size="icon" onClick={onCollapse} aria-label="Collapse chat">
              <XClose className="text-ink-muted" />
            </Button>
          )}
          {layoutMode === 'popup' && (
            <>
              {onExpand && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onExpand}
                  aria-label="Expand to sidebar"
                >
                  <Expand06 className="text-ink-muted" />
                </Button>
              )}
              {onClose && (
                <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close chat">
                  <XClose className="text-ink-muted" />
                </Button>
              )}
            </>
          )}
        </div>
      </header>

      {/* Messages */}
      <div className="chat-scroll flex-1 overflow-y-auto">
        <div className={cn('flex flex-col gap-6', isCentered && 'mx-auto max-w-[720px]')}>
          {messages.length === 0 && !processing && <EmptyState />}
          {messages.map((msg, i) => (
            <MessageBlock key={i} msg={msg} compact={!isCentered} />
          ))}
          {processing && <ThinkingIndicator />}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div className={cn('pt-4', isCentered && 'mx-auto max-w-[720px] py-4')}>
        <ChatInput
          value={input}
          onChange={setInput}
          onSend={send}
          onStop={stop}
          processing={processing}
        />
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div
      className="flex min-h-[60vh] flex-1 flex-col items-center justify-center gap-3"
      style={{ animation: 'fade-in 0.4s ease-out' }}
    >
      <div className="bg-muted border-border flex h-10 w-10 items-center justify-center rounded-full border">
        <MessageChatCircle size={18} className="text-ink-muted" />
      </div>
      <p className="text-ink-muted text-sm">Start a conversation with the agent</p>
    </div>
  )
}

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-1 py-3">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="bg-ink-faint block h-1.5 w-1.5 rounded-full"
          style={{
            animation: 'pulse-dot 1.4s ease-in-out infinite',
            animationDelay: `${i * 0.2}s`
          }}
        />
      ))}
    </div>
  )
}

function MessageBlock({ msg, compact }: { msg: Message; compact?: boolean }) {
  switch (msg.type) {
    case 'user':
      return (
        <p
          className="text-ink ml-8 self-end rounded-md bg-black/[0.07] px-4 py-2 text-base leading-normal wrap-break-word whitespace-pre-wrap"
          style={{ animation: 'fade-in 0.2s ease-out' }}
        >
          {msg.content}
        </p>
      )

    case 'assistant':
      return (
        <div style={{ animation: 'fade-in 0.2s ease-out' }}>
          <div className="text-ink prose-inline text-base leading-normal wrap-break-word">
            <FormattedText text={msg.content} />
          </div>
        </div>
      )

    case 'tool_use':
      return (
        <div
          className="border-border-subtle my-0.5 ml-7 border-l-2 pl-3"
          style={{ animation: 'fade-in 0.15s ease-out' }}
        >
          <details className="group">
            <summary className="flex cursor-pointer items-center gap-2 py-1.5 select-none">
              <ChevronRight
                size={12}
                className="text-ink-faint chevron transition-transform duration-150"
              />
              <span className="text-tool-ink font-mono text-xs font-medium">{msg.name}</span>
              <span
                className={cn(
                  'text-ink-faint truncate font-mono text-[11px]',
                  compact ? 'max-w-[200px]' : 'max-w-[400px]'
                )}
              >
                {formatInputBrief(msg.name, msg.input)}
              </span>
            </summary>
            <div className="bg-tool-bg border-tool-border mt-1 ml-4 rounded-md border px-3 py-2.5">
              <pre className="text-tool-ink max-h-[200px] overflow-y-auto font-mono text-xs leading-relaxed break-all whitespace-pre-wrap">
                {formatInput(msg.name, msg.input)}
              </pre>
            </div>
          </details>
        </div>
      )

    case 'tool_result':
      return (
        <div
          className="border-border-subtle my-0.5 ml-7 border-l-2 pl-3"
          style={{ animation: 'fade-in 0.15s ease-out' }}
        >
          {msg.is_error ? (
            <div className="bg-error-bg border-error-border ml-4 rounded-md border px-3 py-2">
              <pre className="text-error-ink max-h-[160px] overflow-y-auto font-mono text-xs leading-relaxed break-all whitespace-pre-wrap">
                {msg.content || '(empty)'}
              </pre>
            </div>
          ) : (
            <details className="group">
              <summary className="ml-4 flex cursor-pointer items-center gap-2 py-1 select-none">
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="text-ink-faint chevron transition-transform duration-150"
                >
                  <path d="M9 18l6-6-6-6" />
                </svg>
                <span className="text-ink-faint font-mono text-[11px]">
                  Result
                  {msg.content ? ` \u00B7 ${msg.content.length} chars` : ' \u00B7 empty'}
                </span>
              </summary>
              <div className="bg-result-bg border-border-subtle mt-1 ml-4 rounded-md border px-3 py-2.5">
                <pre className="text-ink-muted max-h-[200px] overflow-y-auto font-mono text-xs leading-relaxed break-all whitespace-pre-wrap">
                  {msg.content || '(empty)'}
                </pre>
              </div>
            </details>
          )}
        </div>
      )

    case 'done':
      return null

    case 'stopped':
      return null

    case 'error':
      return (
        <div
          className="bg-error-bg border-error-border text-error-ink my-1 ml-7 rounded-lg border px-3.5 py-2.5 text-sm"
          style={{ animation: 'fade-in 0.2s ease-out' }}
        >
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
            <code key={i} className="bg-muted rounded px-1.5 py-0.5 font-mono text-[13px]">
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
