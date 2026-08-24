import { expect, test } from 'bun:test'

import type { HarnessAvailability } from '@/lib/types'

import { claudeAuthReadiness } from './auth'

const unavailable: HarnessAvailability = {
  status: 'unavailable',
  reason: 'Could not check the Claude login status'
}

test('accepts the documented logged-in exit code', () => {
  expect(claudeAuthReadiness({ exitCode: 0, timedOut: false })).toEqual({
    status: 'available'
  })
})

test('requires login only for the documented signed-out exit code', () => {
  expect(claudeAuthReadiness({ exitCode: 1, timedOut: false })).toEqual({
    status: 'login-required',
    reason: 'Claude is signed out. Sign in to send messages'
  })
})

test('reports a timed-out Claude auth probe as unavailable', () => {
  expect(claudeAuthReadiness({ exitCode: 1, timedOut: true })).toEqual(unavailable)
})

test('reports an abnormal Claude auth exit as unavailable', () => {
  expect(claudeAuthReadiness({ exitCode: 2, timedOut: false })).toEqual(unavailable)
})
