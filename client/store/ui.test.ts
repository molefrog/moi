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
    dockedChatWidth: 360,
    popupChatWidth: 440
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
    expect(restoredStore.getState().popupChatWidth).toBe(440)
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
    useUiStore.getState().setComposerDraft('ws-2', null)

    expect(useUiStore.getState().composerDrafts).toEqual({ 'ws-1': 'Keep me' })
    expect(JSON.parse(storedValues.get('moi:ui') ?? '{}')).toMatchObject({
      state: { composerDrafts: { 'ws-1': 'Keep me' } }
    })
  })
})

describe('pending view drafts', () => {
  test('keeps an empty draft distinct from no draft', () => {
    useUiStore.getState().setComposerDraft('draft-1', 'Chart of expenses')
    useUiStore.getState().setComposerDraft('draft-1', '')

    // Deleted text must stay deleted — a missing entry falls back to the
    // view's server-saved requirements in the composer.
    expect(useUiStore.getState().composerDrafts).toEqual({ 'draft-1': '' })

    useUiStore.getState().setComposerDraft('draft-1', null)

    expect(useUiStore.getState().composerDrafts).toEqual({})
  })

  test('clearing a missing draft leaves state untouched', () => {
    const before = useUiStore.getState()

    useUiStore.getState().setComposerDraft('draft-x', null)

    expect(useUiStore.getState()).toBe(before)
  })

  test('restores drafts in a new store', () => {
    useUiStore.getState().setComposerDraft('draft-1', 'Weekly report view')

    const restoredStore = createUiStore(localStorage)

    expect(restoredStore.getState().composerDrafts).toEqual({
      'draft-1': 'Weekly report view'
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

test('popup width survives reloads independently of the sidebar width', () => {
  useUiStore.getState().setPopupChatWidth(1000)
  useUiStore.getState().setDockedChatWidth(412)

  const restoredStore = createUiStore(localStorage)
  expect(restoredStore.getState().popupChatWidth).toBe(1000)
  expect(restoredStore.getState().dockedChatWidth).toBe(412)
})

test('a pending view draft follows chat creation and native renames, including empty text', () => {
  const draft = JSON.stringify(['ws-1', 'draft:views/cards'])
  const temporary = JSON.stringify(['ws-1', 'temporary'])
  const native = JSON.stringify(['ws-1', 'native'])
  const otherWorkspace = JSON.stringify(['ws-2', 'draft:views/cards'])
  useUiStore.getState().setComposerDraft(draft, '')
  useUiStore.getState().setComposerDraft(otherWorkspace, 'Other workspace')
  useUiStore.getState().moveComposerDraft(draft, temporary)
  useUiStore.getState().moveComposerDraft(temporary, native)
  expect(useUiStore.getState().composerDrafts).toEqual({
    [native]: '',
    [otherWorkspace]: 'Other workspace'
  })
  useUiStore.getState().moveComposerDraft(native, draft)
  expect(useUiStore.getState().composerDrafts[draft]).toBe('')
})
