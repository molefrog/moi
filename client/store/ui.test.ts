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
  useUiStore.setState({
    hasSentMessageFromMoi: false,
    workspaceIdsPendingAnalysis: [],
    composerDrafts: {},
    viewBuilderDrafts: {},
    dockedChatWidth: 360
  })
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

describe('composer drafts', () => {
  test('defaults to no drafts when hydrating UI state saved before drafts existed', () => {
    storedValues.set(
      'moi:ui',
      JSON.stringify({
        state: {
          discoveredWorkspacesOpen: false,
          hasSentMessageFromMoi: true,
          workspaceIdsPendingAnalysis: []
        },
        version: 0
      })
    )

    const restoredStore = createUiStore(localStorage)

    expect(restoredStore.getState().composerDrafts).toEqual({})
    expect(restoredStore.getState().dockedChatWidth).toBe(360)
  })

  test('persists drafts per workspace and restores them in a new store', () => {
    useUiStore.getState().setComposerDraft('ws-1', 'Build a dashboard')
    useUiStore.getState().setComposerDraft('ws-2', 'Summarize this workspace')

    const restoredStore = createUiStore(localStorage)

    expect(restoredStore.getState().composerDrafts).toEqual({
      'ws-1': 'Build a dashboard',
      'ws-2': 'Summarize this workspace'
    })
  })

  test('removes a workspace draft when it is cleared', () => {
    useUiStore.getState().setComposerDraft('ws-1', 'Keep me')
    useUiStore.getState().setComposerDraft('ws-2', 'Send me')
    useUiStore.getState().setComposerDraft('ws-2', '')

    expect(useUiStore.getState().composerDrafts).toEqual({ 'ws-1': 'Keep me' })
    expect(JSON.parse(storedValues.get('moi:ui') ?? '{}')).toMatchObject({
      state: { composerDrafts: { 'ws-1': 'Keep me' } }
    })
  })
})

describe('view builder drafts', () => {
  test('keeps an empty draft distinct from no draft', () => {
    useUiStore.getState().setViewBuilderDraft('builder-1', 'Chart of expenses')
    useUiStore.getState().setViewBuilderDraft('builder-1', '')

    // Deleted text must stay deleted — a missing entry falls back to the
    // builder's server-saved requirements in the composer.
    expect(useUiStore.getState().viewBuilderDrafts).toEqual({ 'builder-1': '' })

    useUiStore.getState().setViewBuilderDraft('builder-1', null)

    expect(useUiStore.getState().viewBuilderDrafts).toEqual({})
  })

  test('clearing a missing draft leaves state untouched', () => {
    const before = useUiStore.getState()

    useUiStore.getState().setViewBuilderDraft('builder-x', null)

    expect(useUiStore.getState()).toBe(before)
  })

  test('restores drafts in a new store', () => {
    useUiStore.getState().setViewBuilderDraft('builder-1', 'Weekly report view')

    const restoredStore = createUiStore(localStorage)

    expect(restoredStore.getState().viewBuilderDrafts).toEqual({
      'builder-1': 'Weekly report view'
    })
  })
})

describe('docked chat width', () => {
  test('defaults to 360px', () => {
    expect(useUiStore.getState().dockedChatWidth).toBe(360)
  })

  test('persists one width across stores', () => {
    useUiStore.getState().setDockedChatWidth(412)

    const restoredStore = createUiStore(localStorage)

    expect(restoredStore.getState().dockedChatWidth).toBe(412)
    expect(JSON.parse(storedValues.get('moi:ui') ?? '{}')).toMatchObject({
      state: { dockedChatWidth: 412 }
    })
  })
})
