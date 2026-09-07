import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import type { AgentQuestion } from '@/lib/format'
import { AgentInputRequest } from './AgentInputRequest'

function render(question: AgentQuestion) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <AgentInputRequest
        workspaceId="workspace"
        sessionId="session"
        notice={{
          id: 'question',
          kind: 'user-input',
          at: '2026-09-07',
          status: 'pending',
          questions: [question]
        }}
      />
    </QueryClientProvider>
  )
}

const question: AgentQuestion = {
  id: 'choice',
  header: 'Color',
  question: 'Which color?',
  isSecret: false,
  options: [{ label: 'Blue', description: 'Ocean' }]
}

test('fixed-choice questions expose buttons without an arbitrary text field', () => {
  const html = render({ ...question, allowOther: false })
  expect(html).toContain('Blue')
  expect(html).toContain('aria-pressed="false"')
  expect(html).not.toContain('<input')
  expect(html).toContain('disabled')
})

test('free-form and secret questions retain their appropriate inputs', () => {
  expect(render({ ...question, allowOther: true })).toContain('type="text"')
  expect(render({ ...question, options: undefined, allowOther: false })).toContain('type="text"')
  expect(render({ ...question, isSecret: true })).toContain('type="password"')
})
