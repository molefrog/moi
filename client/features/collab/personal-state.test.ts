import { afterEach, describe, expect, test } from 'bun:test'
import { QueryClient, QueryObserver } from '@tanstack/react-query'

import {
  applySelectedSessionEvent,
  optimisticallySetSelectedSession,
  renameSelectedSessionInCache,
  selectedSessionKey,
  settleSelectedSessionSave
} from '@/client/features/chat/useSelectedSession'
import type { SelectedSessionState, WorkspaceTabsState } from '@/lib/types'
import { createDefaultWorkspaceLayout } from '@/lib/workspace-layout'
import { mergeLayoutForSave } from '@/server/layout'

import {
  readPersonalSession,
  readPersonalTabs,
  writePersonalSession,
  writePersonalTabs
} from './personal-state'

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')

function browserTab(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    key: index => [...data.keys()][index] ?? null,
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
    removeItem: key => {
      data.delete(key)
    }
  }
}

function useBrowserTab(storage: Storage) {
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: storage })
}

afterEach(() => {
  if (originalStorage) Object.defineProperty(globalThis, 'sessionStorage', originalStorage)
  else Reflect.deleteProperty(globalThis, 'sessionStorage')
})

const defaults: WorkspaceTabsState = { open: ['overview', 'view:board'], active: 'overview' }

describe('collab personal state', () => {
  test('two browser tabs select chats independently, including New chat', () => {
    const anna = browserTab()
    const boris = browserTab()
    useBrowserTab(anna)
    writePersonalSession('workspace', 'annas-chat')
    useBrowserTab(boris)
    expect(readPersonalSession('workspace')).toBeNull()
    writePersonalSession('workspace', 'boris-chat')
    useBrowserTab(anna)
    expect(readPersonalSession('workspace')).toBe('annas-chat')
    writePersonalSession('workspace', null)
    expect(readPersonalSession('workspace')).toBeNull()
    useBrowserTab(boris)
    expect(readPersonalSession('workspace')).toBe('boris-chat')
  })

  test('personal chat and view choices survive reads and stay partitioned by workspace', () => {
    useBrowserTab(browserTab())
    const selected: WorkspaceTabsState = { open: ['overview', 'view:board'], active: 'view:board' }
    writePersonalSession('one', 'chat-one')
    writePersonalSession('two', 'chat-two')
    writePersonalTabs('one', selected)
    expect(readPersonalSession('one')).toBe('chat-one')
    expect(readPersonalSession('two')).toBe('chat-two')
    expect(readPersonalTabs('one', defaults)).toEqual(selected)
    expect(readPersonalTabs('two', defaults)).toEqual(defaults)
    expect(defaults.active).toBe('overview')
  })

  test('local view selection does not change another tab or the authored defaults', () => {
    const anna = browserTab()
    const boris = browserTab()
    useBrowserTab(anna)
    writePersonalTabs('workspace', { open: ['overview', 'view:board'], active: 'view:board' })
    useBrowserTab(boris)
    expect(readPersonalTabs('workspace', defaults)).toEqual(defaults)
    writePersonalTabs('workspace', { open: ['overview', 'scratchpad'], active: 'scratchpad' })
    useBrowserTab(anna)
    expect(readPersonalTabs('workspace', defaults).active).toBe('view:board')
    expect(defaults).toEqual({ open: ['overview', 'view:board'], active: 'overview' })
  })

  test('malformed saved tabs fall back safely and stored tab lists are normalized', () => {
    const storage = browserTab()
    useBrowserTab(storage)
    storage.setItem('moi:collab:workspace:tabs', '{broken')
    expect(readPersonalTabs('workspace', defaults)).toEqual(defaults)
    storage.setItem(
      'moi:collab:workspace:tabs',
      JSON.stringify({
        open: ['view:board', 'view:board', 'not-a-tab'],
        active: 'not-a-tab'
      })
    )
    expect(readPersonalTabs('workspace', defaults)).toEqual({
      open: ['overview', 'view:board'],
      active: 'overview'
    })
  })

  test('denied browser storage does not crash personal selection', () => {
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      get: () => {
        throw new Error('Storage disabled')
      }
    })
    expect(readPersonalSession('workspace')).toBeNull()
    expect(readPersonalTabs('workspace', defaults)).toEqual(defaults)
    expect(() => writePersonalSession('workspace', 'chat')).not.toThrow()
    expect(() => writePersonalTabs('workspace', defaults)).not.toThrow()
  })
})

describe('collab authored layout preservation', () => {
  test('saving shared layout after personal navigation preserves authored tab defaults', () => {
    useBrowserTab(browserTab())
    const existing = {
      ...createDefaultWorkspaceLayout(),
      tabs: defaults
    }
    const personal: WorkspaceTabsState = {
      open: ['overview', 'scratchpad'],
      active: 'scratchpad'
    }
    writePersonalTabs('workspace', personal)
    const { tabs: _tabs, ...layout } = existing
    const merged = mergeLayoutForSave(existing, { ...layout, layoutMode: 'fullscreen' })
    expect(merged.tabs).toEqual(defaults)
    expect(merged.layoutMode).toBe('fullscreen')
    expect(readPersonalTabs('workspace', defaults)).toEqual(personal)
  })

  test('ordinary workspace saves retain their existing shared tab behavior', () => {
    const existing = createDefaultWorkspaceLayout()
    const tabs: WorkspaceTabsState = { open: ['overview', 'scratchpad'], active: 'scratchpad' }
    expect(mergeLayoutForSave(existing, { ...existing, tabs }).tabs).toEqual(tabs)
  })
})

describe('collab selected chat cache transitions', () => {
  test('supplying an identity immediately remounts onto the saved tab chat before shared cache GC', async () => {
    useBrowserTab(browserTab())
    writePersonalSession('workspace', 'saved-tab-chat')
    const client = new QueryClient()
    const sharedKey = selectedSessionKey('workspace')
    client.setQueryData(sharedKey, { sessionId: 'old-shared-chat' })
    const options = { staleTime: Infinity, gcTime: 0, refetchOnMount: false as const }
    const shared = new QueryObserver<SelectedSessionState>(client, {
      ...options,
      queryKey: sharedKey,
      queryFn: async () => ({ sessionId: 'old-shared-chat' })
    })
    const stopShared = shared.subscribe(() => {})
    stopShared()
    let reads = 0
    const personal = new QueryObserver<SelectedSessionState>(client, {
      ...options,
      queryKey: selectedSessionKey('workspace', true),
      queryFn: async () => {
        reads++
        return { sessionId: readPersonalSession('workspace') }
      }
    })
    let stopPersonal = () => {}
    try {
      // Do not wait for gcTime: a keyed React remount adds its new observer in
      // the same commit, before the old cache's zero-delay GC timer can run.
      const selected = await new Promise<SelectedSessionState | undefined>(resolve => {
        const inspect = () => {
          const result = personal.getCurrentResult()
          if (result.isSuccess) resolve(result.data)
        }
        stopPersonal = personal.subscribe(inspect)
        inspect()
      })
      expect(selected).toEqual({ sessionId: 'saved-tab-chat' })
      expect(reads).toBe(1)
    } finally {
      stopPersonal()
      client.clear()
    }
  })

  test('a late shared save and remote selection event cannot replace the current personal chat', () => {
    const client = new QueryClient()
    try {
      client.setQueryData(selectedSessionKey('workspace'), { sessionId: 'old-shared-chat' })
      const pendingShared = optimisticallySetSelectedSession(
        client,
        'workspace',
        'in-flight-shared-chat'
      )
      const personal = optimisticallySetSelectedSession(client, 'workspace', 'personal-chat', true)
      if (!pendingShared || !personal) throw new Error('Expected pending selections')
      settleSelectedSessionSave(
        client,
        'workspace',
        { sessionId: 'in-flight-shared-chat' },
        pendingShared
      )
      applySelectedSessionEvent(client, 'workspace', 'remote-chat', false)
      expect(
        client.getQueryData<SelectedSessionState>(selectedSessionKey('workspace', true))
      ).toEqual({
        sessionId: 'personal-chat'
      })
      expect(client.getQueryData<SelectedSessionState>(selectedSessionKey('workspace'))).toEqual({
        sessionId: 'remote-chat'
      })
      settleSelectedSessionSave(client, 'workspace', { sessionId: 'personal-chat' }, personal, true)
      expect(
        client.getQueryData<SelectedSessionState>(selectedSessionKey('workspace', true))
      ).toEqual({
        sessionId: 'personal-chat'
      })
    } finally {
      client.clear()
    }
  })

  test('a session id replacement follows the selected personal chat into saved tab state', () => {
    useBrowserTab(browserTab())
    const client = new QueryClient()
    try {
      writePersonalSession('workspace', 'temporary-id')
      client.setQueryData(selectedSessionKey('workspace', true), { sessionId: 'temporary-id' })
      client.setQueryData(selectedSessionKey('workspace'), { sessionId: 'different-shared-chat' })
      renameSelectedSessionInCache(client, 'workspace', 'temporary-id', 'provider-id')
      expect(readPersonalSession('workspace')).toBe('provider-id')
      expect(
        client.getQueryData<SelectedSessionState>(selectedSessionKey('workspace', true))
      ).toEqual({
        sessionId: 'provider-id'
      })
      expect(client.getQueryData<SelectedSessionState>(selectedSessionKey('workspace'))).toEqual({
        sessionId: 'different-shared-chat'
      })
    } finally {
      client.clear()
    }
  })
})
