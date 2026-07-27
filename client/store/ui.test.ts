import { beforeEach, describe, expect, test } from 'bun:test'

import { createUiStore } from './ui'

const storedValues = new Map<string, string>()
const localStorage = {
  getItem: (key: string) => storedValues.get(key) ?? null,
  setItem: (key: string, value: string) => storedValues.set(key, value),
  removeItem: (key: string) => storedValues.delete(key)
}

const useUiStore = createUiStore(localStorage)

beforeEach(() => {
  storedValues.clear()
  useUiStore.setState({ hasSentMessageFromMoi: false, workspaceIdsPendingAnalysis: [] })
})

describe('first-message onboarding markers', () => {
  test('persists the pending-analysis workspace until a message is sent', () => {
    useUiStore.getState().markWorkspacePendingAnalysis('ws-1')
    useUiStore.getState().markWorkspacePendingAnalysis('ws-1')

    expect(useUiStore.getState().workspaceIdsPendingAnalysis).toEqual(['ws-1'])
    expect(JSON.parse(storedValues.get('moi:ui') ?? '{}')).toMatchObject({
      state: { workspaceIdsPendingAnalysis: ['ws-1'] }
    })

    useUiStore.getState().markMessageSentFromMoi('ws-1')

    expect(useUiStore.getState().hasSentMessageFromMoi).toBe(true)
    expect(useUiStore.getState().workspaceIdsPendingAnalysis).toEqual([])
    expect(JSON.parse(storedValues.get('moi:ui') ?? '{}')).toMatchObject({
      state: { hasSentMessageFromMoi: true, workspaceIdsPendingAnalysis: [] }
    })
  })
})
