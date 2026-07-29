import { describe, expect, test } from 'bun:test'

import { toSessionInfo } from './adapter'

describe('toSessionInfo', () => {
  test('prefers a stable label over display name and changing preview text', () => {
    expect(
      toSessionInfo(
        {
          key: 'agent:main:one',
          sessionId: 'one',
          updatedAt: 1,
          label: 'Customer dashboard',
          displayName: 'Derived title',
          lastMessagePreview: 'The latest reply'
        },
        '/workspace'
      ).summary
    ).toBe('Customer dashboard')
  })

  test('uses display name before the latest-message preview', () => {
    expect(
      toSessionInfo(
        {
          key: 'agent:main:one',
          sessionId: 'one',
          updatedAt: 1,
          displayName: 'Stable display name',
          lastMessagePreview: 'The latest reply'
        },
        '/workspace'
      ).summary
    ).toBe('Stable display name')
  })

  test('formats a raw preview when no stable name exists', () => {
    expect(
      toSessionInfo(
        {
          key: 'agent:main:one',
          sessionId: 'one',
          updatedAt: 1,
          lastMessagePreview: '**Build   a dashboard**'
        },
        '/workspace'
      ).summary
    ).toBe('Build a dashboard')
  })
})
