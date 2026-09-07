import { useId, useState } from 'react'

import { useMutation } from '@tanstack/react-query'

import { jsonRequest, requestVoid } from '@/client/api/http'
import { Button } from '@/client/components/ui/button'
import { Input } from '@/client/components/ui/input'
import { cn } from '@/client/lib/cn'
import type { SystemNotice } from '@/lib/format'

type AgentInputRequestProps = {
  workspaceId: string
  sessionId: string
  notice: Extract<SystemNotice, { kind: 'user-input' }>
}

export function AgentInputRequest({ workspaceId, sessionId, notice }: AgentInputRequestProps) {
  const id = useId()
  const [answers, setAnswers] = useState<Record<string, string>>({})
  // Question ids come from the provider and may match Object prototype keys.
  const answerFor = (questionId: string) =>
    Object.hasOwn(answers, questionId) ? answers[questionId] : ''
  const submit = useMutation({
    mutationFn: (skip: boolean) =>
      requestVoid(
        `/api/workspaces/${workspaceId}/sessions/${encodeURIComponent(sessionId)}/input`,
        jsonRequest('POST', { requestId: notice.id, answers: skip ? null : answers }),
        'Could not send your answer'
      ),
    onSuccess: () => setAnswers({})
  })
  const pending = notice.status === 'pending' && !submit.isSuccess
  if (!pending)
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {notice.status === 'cancelled' || submit.variables === true
          ? 'Question skipped'
          : 'Answer sent'}
      </p>
    )

  return (
    <form
      className="space-y-4 rounded-lg bg-card p-3 shadow-sm"
      onSubmit={event => {
        event.preventDefault()
        submit.mutate(false)
      }}
    >
      {notice.questions.map((question, index) => (
        <fieldset key={question.id} className="min-w-0 space-y-2" disabled={submit.isPending}>
          <legend className="mb-2 text-sm">{question.question}</legend>
          {question.options?.length ? (
            <div className="flex flex-wrap gap-1.5">
              {question.options.map(option => (
                <Button
                  key={option.label}
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-pressed={answerFor(question.id) === option.label}
                  title={option.description}
                  className={cn(
                    'h-auto text-left whitespace-normal',
                    answerFor(question.id) === option.label && 'bg-accent'
                  )}
                  onClick={() =>
                    setAnswers(current => ({ ...current, [question.id]: option.label }))
                  }
                >
                  {option.label}
                </Button>
              ))}
            </div>
          ) : null}
          <label className="sr-only" htmlFor={`${id}-${index}`}>
            Answer: {question.question}
          </label>
          <Input
            id={`${id}-${index}`}
            type={question.isSecret ? 'password' : 'text'}
            autoComplete="off"
            placeholder={
              question.options?.length ? 'Choose an option or write an answer' : 'Your answer'
            }
            value={answerFor(question.id)}
            onChange={event =>
              setAnswers(current => ({ ...current, [question.id]: event.target.value }))
            }
            maxLength={10_000}
            required
          />
        </fieldset>
      ))}
      {submit.error && (
        <p role="alert" className="text-sm text-destructive">
          {submit.error.message}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={
            submit.isPending || notice.questions.some(question => !answerFor(question.id).trim())
          }
        >
          {submit.isPending ? 'Sending…' : 'Send answer'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={submit.isPending}
          onClick={() => submit.mutate(true)}
        >
          Skip
        </Button>
      </div>
    </form>
  )
}
