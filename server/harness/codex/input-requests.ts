import type { AgentQuestion, SystemNotice } from '@/lib/format'

import type { Json } from './transport'

type PendingInput = {
  notice: Extract<SystemNotice, { kind: 'user-input' }>
  turnId: string
  blocking: boolean
  resolve: (response: Json) => void
}

// moi's notices and debug ring retain no submitted answers. Codex receives
// the tool response and owns its durable history.
export class CodexInputRequests {
  private pending = new Map<string, PendingInput>()

  constructor(private changed: (notice: SystemNotice) => void) {}

  get blocking(): boolean {
    return [...this.pending.values()].some(request => request.blocking)
  }

  get hasPending(): boolean {
    return this.pending.size > 0
  }

  request(params: Json, id: string | number): Promise<Json> {
    const questions = parseQuestions(params.questions)
    if (!questions.length) return Promise.reject(new Error('Codex sent an empty input request'))
    const key = String(id)
    if (this.pending.has(key))
      return Promise.reject(new Error('Codex repeated a pending input request'))
    return new Promise(resolve => {
      const notice: PendingInput['notice'] = {
        // Native request ids restart with the process. A stale browser form
        // must never be able to answer a different question after reconnect.
        id: `codex:input:${crypto.randomUUID()}`,
        kind: 'user-input',
        at: new Date().toISOString(),
        status: 'pending',
        questions
      }
      this.pending.set(key, {
        notice,
        resolve,
        turnId: String(params.turnId ?? ''),
        blocking: params.isBlocking !== false
      })
      this.changed(notice)
    })
  }

  answer(noticeId: string, value: unknown): void {
    const entry = [...this.pending].find(([, request]) => request.notice.id === noticeId)
    if (!entry) throw new Error('This question is no longer waiting for an answer')
    if (value === null) {
      this.finish(entry[0], 'cancelled', { answers: {} })
      return
    }
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Answers must be an object')
    const given = value as Record<string, unknown>
    const answers: [string, { answers: string[] }][] = []
    for (const question of entry[1].notice.questions) {
      const answer = given[question.id]
      if (typeof answer !== 'string' || !answer.trim() || answer.length > 10_000) {
        throw new Error('Answer each question before continuing')
      }
      answers.push([question.id, { answers: [answer] }])
    }
    this.finish(entry[0], 'answered', { answers: Object.fromEntries(answers) })
  }

  cancel(id?: string | number): void {
    for (const key of [...this.pending.keys()]) {
      if (id === undefined || key === String(id)) this.finish(key, 'cancelled', { answers: {} })
    }
  }

  cancelTurn(turnId: string): void {
    for (const [key, request] of this.pending) {
      if (request.turnId === turnId) this.finish(key, 'cancelled', { answers: {} })
    }
  }

  private finish(key: string, status: 'answered' | 'cancelled', response: Json) {
    const request = this.pending.get(key)
    if (!request) return
    this.pending.delete(key)
    this.changed({ ...request.notice, status })
    request.resolve(response)
  }
}

function parseQuestions(value: unknown): AgentQuestion[] {
  if (!Array.isArray(value)) return []
  const questions: AgentQuestion[] = []
  for (const raw of value as unknown[]) {
    if (!raw || typeof raw !== 'object') continue
    const question = raw as Json
    if (typeof question.id !== 'string' || typeof question.question !== 'string') continue
    if (questions.some(existing => existing.id === question.id)) continue
    questions.push({
      id: question.id,
      header: typeof question.header === 'string' ? question.header : '',
      question: question.question,
      isSecret: question.isSecret === true,
      ...(Array.isArray(question.options)
        ? {
            options: question.options.filter(
              (option: unknown): option is { label: string; description: string } => {
                if (!option || typeof option !== 'object') return false
                const row = option as Json
                return typeof row.label === 'string' && typeof row.description === 'string'
              }
            )
          }
        : {})
    })
  }
  return questions
}
