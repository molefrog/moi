import { expect, test } from 'bun:test'

import type { HarnessAvailability } from '@/lib/types'

import { claudeAuthReadiness } from './auth'

const unavailable: HarnessAvailability = {
  status: 'unavailable',
  reason: 'Could not check the Claude login status'
}

test('accepts an explicit logged-in Claude status', () => {
  expect(
    claudeAuthReadiness({
      exitCode: 0,
      stdout: JSON.stringify({ loggedIn: true, authMethod: 'oauth' }),
      timedOut: false
    })
  ).toEqual({ status: 'available' })
})

test('requires login only for an explicit signed-out Claude status', () => {
  expect(
    claudeAuthReadiness({
      exitCode: 1,
      stdout: JSON.stringify({ loggedIn: false, authMethod: 'none' }),
      timedOut: false
    })
  ).toEqual({
    status: 'login-required',
    reason: 'Claude is signed out. Sign in to send messages'
  })
})

test('reports malformed Claude auth output as unavailable', () => {
  expect(claudeAuthReadiness({ exitCode: 1, stdout: 'not json', timedOut: false })).toEqual(
    unavailable
  )
  expect(claudeAuthReadiness({ exitCode: 1, stdout: JSON.stringify({}), timedOut: false })).toEqual(
    unavailable
  )
})

test('reports a timed-out Claude auth probe as unavailable', () => {
  expect(
    claudeAuthReadiness({
      exitCode: 1,
      stdout: JSON.stringify({ loggedIn: false }),
      timedOut: true
    })
  ).toEqual(unavailable)
})

test('reports an abnormal Claude auth exit as unavailable', () => {
  expect(
    claudeAuthReadiness({
      exitCode: 2,
      stdout: JSON.stringify({ loggedIn: true }),
      timedOut: false
    })
  ).toEqual(unavailable)
})
