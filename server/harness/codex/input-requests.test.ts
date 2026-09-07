import { expect, test } from 'bun:test'

import type { SystemNotice } from '@/lib/format'

import { CodexInputRequests } from './input-requests'

function fixture() {
  const notices: SystemNotice[] = []
  const inputs = new CodexInputRequests(notice => notices.push(notice))
  const params = {
    turnId: 'turn',
    isBlocking: true,
    questions: [
      {
        id: 'choice',
        header: 'Color',
        question: 'Which color?',
        options: [{ label: 'Blue', description: 'Ocean' }],
        isSecret: false
      }
    ]
  }
  return { inputs, params, notices }
}

test('native user input round-trip tracks blocking state and keeps answers out of notices', async () => {
  const f = fixture()
  const response = f.inputs.request(f.params, 10)
  expect(f.inputs.blocking).toBe(true)
  f.inputs.answer(f.notices[0].id, { choice: 'private answer', ignored: 'not sent' })
  expect(await response).toEqual({ answers: { choice: { answers: ['private answer'] } } })
  expect(f.inputs.blocking).toBe(false)
  expect(JSON.stringify(f.notices)).not.toContain('private answer')
  expect(f.notices.at(-1)).toMatchObject({ status: 'answered' })
  expect(() => f.inputs.answer(f.notices[0].id, { choice: 'duplicate' })).toThrow('no longer')
})

test('invalid answers leave the request available for correction', async () => {
  const f = fixture()
  const response = f.inputs.request(f.params, 'a')
  expect(() => f.inputs.answer(f.notices[0].id, {})).toThrow('each question')
  expect(f.inputs.blocking).toBe(true)
  f.inputs.answer(f.notices[0].id, { choice: 'Blue' })
  await response
})

test('skip, external resolution, interrupt and disconnect unblock pending RPCs', async () => {
  const f = fixture()
  const first = f.inputs.request(f.params, 1)
  f.inputs.answer(f.notices[0].id, null)
  expect(await first).toEqual({ answers: {} })
  const second = f.inputs.request(f.params, 2)
  f.inputs.cancelTurn('unrelated')
  expect(f.inputs.blocking).toBe(true)
  f.inputs.cancelTurn('turn')
  expect(await second).toBeUndefined()
  const third = f.inputs.request({ ...f.params, isBlocking: false }, 3)
  expect(f.inputs.blocking).toBe(false)
  f.inputs.cancel()
  expect(await third).toEqual({ answers: {} })
})

test('fixed choices reject arbitrary answers while free-form questions remain answerable', async () => {
  const f = fixture()
  const fixed = f.inputs.request(
    { ...f.params, questions: [{ ...f.params.questions[0], isOther: false }] },
    1
  )
  expect(f.notices[0]).toMatchObject({ questions: [{ allowOther: false }] })
  expect(() => f.inputs.answer(f.notices[0].id, { choice: 'custom' })).toThrow('offered options')
  f.inputs.answer(f.notices[0].id, { choice: 'Blue' })
  expect(await fixed).toEqual({ answers: { choice: { answers: ['Blue'] } } })
  const text = f.inputs.request(
    { questions: [{ id: 'text', question: 'Explain', isOther: false, options: null }] },
    2
  )
  f.inputs.answer(f.notices.at(-1)!.id, { text: 'A free-form answer' })
  expect(await text).toEqual({ answers: { text: { answers: ['A free-form answer'] } } })
})

test('numeric and string request ids are distinct and server resolution sends no answer', async () => {
  const f = fixture()
  const numeric = f.inputs.request(f.params, 1)
  const string = f.inputs.request(f.params, '1')
  f.inputs.resolved(1)
  expect(await numeric).toBeUndefined()
  expect(f.inputs.blocking).toBe(true)
  f.inputs.answer(f.notices[1].id, { choice: 'Blue' })
  expect(await string).toEqual({ answers: { choice: { answers: ['Blue'] } } })
})

test('reused native ids cannot let a stale form answer a new question', async () => {
  const f = fixture()
  const first = f.inputs.request(f.params, 0)
  const staleId = f.notices[0].id
  f.inputs.cancel()
  await first
  const second = f.inputs.request(f.params, 0)
  expect(() => f.inputs.answer(staleId, { choice: 'stale answer' })).toThrow('no longer')
  f.inputs.answer(f.notices.at(-1)!.id, { choice: 'fresh answer' })
  expect(await second).toEqual({ answers: { choice: { answers: ['fresh answer'] } } })
})
