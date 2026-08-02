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

  test('uses display name before derived title and latest-message preview', () => {
    expect(
      toSessionInfo(
        {
          key: 'agent:main:one',
          sessionId: 'one',
          updatedAt: 1,
          displayName: 'Stable display name',
          derivedTitle: 'Derived title',
          lastMessagePreview: 'The latest reply'
        },
        '/workspace'
      ).summary
    ).toBe('Stable display name')
  })

  test('uses a derived title before the latest-message preview', () => {
    expect(
      toSessionInfo(
        {
          key: 'agent:main:one',
          sessionId: 'one',
          updatedAt: 1,
          derivedTitle: 'First message title',
          lastMessagePreview: 'The latest reply'
        },
        '/workspace'
      ).summary
    ).toBe('First message title')
  })

  test('uses a normalized preview when no title exists', () => {
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
    ).toBe('**Build a dashboard**')
  })
})
