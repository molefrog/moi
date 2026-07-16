import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react'

import { IconArrowUp, IconLoader2 } from '@tabler/icons-react'

import { Button } from '@/client/components/ui/button'
import type { ViewBuilder } from '@/lib/types'

type ViewBuilderTabProps = {
  builder: ViewBuilder
  onSave: (requirements: string) => Promise<unknown>
  onSubmit: (requirements: string) => Promise<unknown>
  onOpenChat: () => void
  onDiscard: () => void
}

export function ViewBuilderTab({
  builder,
  onSave,
  onSubmit,
  onOpenChat,
  onDiscard
}: ViewBuilderTabProps) {
  const [requirements, setRequirements] = useState(builder.input.requirements)
  const [submitting, setSubmitting] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave

  useEffect(() => {
    if (builder.status !== 'draft' || requirements === builder.input.requirements) return
    const timer = setTimeout(() => {
      void onSaveRef
        .current(requirements)
        .then(() => setSaveError(null))
        .catch(error =>
          setSaveError(error instanceof Error ? error.message : 'Could not save requirements')
        )
    }, 500)
    return () => clearTimeout(timer)
  }, [builder.input.requirements, builder.status, requirements])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!requirements.trim() || submitting) return
    setSubmitting(true)
    try {
      await onSubmit(requirements)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not start view builder')
      setSubmitting(false)
    }
  }

  if (builder.status === 'draft') {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-3 py-6">
        <div className="flex w-full max-w-(--chat-max-container) flex-col gap-6">
          <div className="flex flex-col gap-1 text-center">
            <h1 className="font-medium">What should this view do?</h1>
            <p className="mx-auto max-w-sm text-sm text-muted-foreground">
              Describe the content, data, and actions you need.
            </p>
          </div>
          <form
            onSubmit={submit}
            onMouseDown={event => {
              if (event.target instanceof HTMLElement && event.target.closest('button')) return
              event.preventDefault()
              composerRef.current?.focus()
            }}
            className="flex w-full cursor-text flex-col gap-1 rounded-lg bg-card p-2 text-card-foreground shadow-xs transition-[color,box-shadow] outline-none focus-within:shadow-sm"
          >
            <label className="sr-only" htmlFor={`view-builder-${builder.id}`}>
              View requirements
            </label>
            <textarea
              ref={composerRef}
              id={`view-builder-${builder.id}`}
              value={requirements}
              onChange={event => setRequirements(event.target.value)}
              onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault()
                  event.currentTarget.form?.requestSubmit()
                }
              }}
              placeholder="Build a customer dashboard with…"
              rows={1}
              className="field-sizing-content max-h-40 min-h-16 w-full resize-none bg-transparent px-2 py-1 text-sm leading-relaxed outline-none placeholder:text-muted-foreground disabled:opacity-50"
              aria-describedby={saveError ? `view-builder-error-${builder.id}` : undefined}
              aria-invalid={Boolean(saveError)}
              autoFocus
            />
            <div className="flex items-center justify-end gap-1.5">
              <Button
                type="submit"
                size="icon"
                disabled={!requirements.trim() || submitting}
                aria-label="Build view"
              >
                {submitting ? (
                  <IconLoader2 stroke={1.5} className="animate-spin" />
                ) : (
                  <IconArrowUp stroke={1.5} />
                )}
              </Button>
            </div>
          </form>
          {saveError && (
            <p
              id={`view-builder-error-${builder.id}`}
              role="alert"
              className="text-sm text-destructive"
            >
              {saveError}
            </p>
          )}
        </div>
      </div>
    )
  }

  if (builder.status === 'waiting') {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="flex max-w-md flex-col items-center gap-4 text-center">
          <div className="flex flex-col gap-1">
            <h1 className="text-lg font-semibold">The view needs your attention</h1>
            <p className="text-sm text-muted-foreground">
              {builder.error ?? 'Open its chat to answer or ask the agent to continue.'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={onOpenChat}>Open chat</Button>
            <Button variant="secondary" onClick={onDiscard}>
              Discard
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <IconLoader2 stroke={1.75} className="animate-spin" />
        {builder.status === 'ready' ? 'Opening view…' : 'Building your view…'}
      </div>
    </div>
  )
}
