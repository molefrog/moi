import { afterEach, describe, expect, test } from 'bun:test'
import { QueryClient, QueryObserver } from '@tanstack/react-query'

import {
  applySelectedSessionEvent,
  optimisticallySetSelectedSession,
  renameSelectedSessionInCache,
  selectedSessionKey,
  settleSelectedSessionSave
} from '@/client/features/chat/sessions/useSelectedSession'
import type { SelectedSessionState, WorkspaceTabsState } from '@/lib/types'
import { createDefaultWorkspaceLayout } from '@/lib/workspace-layout'
import { mergeLayoutForSave } from '@/server/layout'

import {
  readBrowserTabSelectedSession,
  readWorkspaceTabs,
  writeBrowserTabSelectedSession,
  writeWorkspaceTabs
} from './browser-tab-state'

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

const defaults: WorkspaceTabsState = { open: ['overview', 'views/board'], active: 'overview' }

describe('collab browser tab state', () => {
  test('two browser tabs select chats independently, including New chat', () => {
    const anna = browserTab()
    const boris = browserTab()
    useBrowserTab(anna)
    writeBrowserTabSelectedSession('workspace', 'annas-chat')
    expect(anna.getItem('moi:collab:workspace:session')).toBe('annas-chat')
    useBrowserTab(boris)
    expect(readBrowserTabSelectedSession('workspace')).toBeNull()
    writeBrowserTabSelectedSession('workspace', 'boris-chat')
    useBrowserTab(anna)
    expect(readBrowserTabSelectedSession('workspace')).toBe('annas-chat')
    writeBrowserTabSelectedSession('workspace', null)
    expect(readBrowserTabSelectedSession('workspace')).toBeNull()
    useBrowserTab(boris)
    expect(readBrowserTabSelectedSession('workspace')).toBe('boris-chat')
  })

  test('browser tab chat and view choices survive reads and stay partitioned by workspace', () => {
    useBrowserTab(browserTab())
    const selected: WorkspaceTabsState = {
      open: ['overview', 'views/board'],
      active: 'views/board'
    }
    writeBrowserTabSelectedSession('one', 'chat-one')
    writeBrowserTabSelectedSession('two', 'chat-two')
    writeWorkspaceTabs('one', selected)
    expect(readBrowserTabSelectedSession('one')).toBe('chat-one')
    expect(readBrowserTabSelectedSession('two')).toBe('chat-two')
    expect(readWorkspaceTabs('one', defaults)).toEqual(selected)
    expect(readWorkspaceTabs('two', defaults)).toEqual(defaults)
    expect(defaults.active).toBe('overview')
  })

  test('local view selection does not change another tab or the authored defaults', () => {
    const anna = browserTab()
    const boris = browserTab()
    useBrowserTab(anna)
    writeWorkspaceTabs('workspace', {
      open: ['overview', 'views/board'],
      active: 'views/board'
    })
    useBrowserTab(boris)
    expect(readWorkspaceTabs('workspace', defaults)).toEqual(defaults)
    writeWorkspaceTabs('workspace', {
      open: ['overview', 'scratchpad'],
      active: 'scratchpad'
    })
    useBrowserTab(anna)
    expect(readWorkspaceTabs('workspace', defaults).active).toBe('views/board')
    expect(defaults).toEqual({ open: ['overview', 'views/board'], active: 'overview' })
  })

  test('malformed saved tabs fall back safely and stored tab lists are normalized', () => {
    const storage = browserTab()
    useBrowserTab(storage)
    storage.setItem('moi:collab:workspace:tabs', '{broken')
    expect(readWorkspaceTabs('workspace', defaults)).toEqual(defaults)
    storage.setItem(
      'moi:collab:workspace:tabs',
      JSON.stringify({
        open: ['views/board', 'views/board', 'not-a-tab'],
        active: 'not-a-tab'
      })
    )
    expect(readWorkspaceTabs('workspace', defaults)).toEqual({
      open: ['overview', 'views/board'],
      active: 'overview'
    })
  })

  test('denied browser storage does not crash browser tab selection', () => {
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      get: () => {
        throw new Error('Storage disabled')
      }
    })
    expect(readBrowserTabSelectedSession('workspace')).toBeNull()
    expect(readWorkspaceTabs('workspace', defaults)).toEqual(defaults)
    expect(() => writeBrowserTabSelectedSession('workspace', 'chat')).not.toThrow()
    expect(() => writeWorkspaceTabs('workspace', defaults)).not.toThrow()
  })
})

describe('collab authored layout preservation', () => {
  test('saving shared layout after browser tab navigation preserves authored tab defaults', () => {
    useBrowserTab(browserTab())
    const existing = {
      ...createDefaultWorkspaceLayout(),
      tabs: defaults
    }
    const localTabs: WorkspaceTabsState = {
      open: ['overview', 'scratchpad'],
      active: 'scratchpad'
    }
    writeWorkspaceTabs('workspace', localTabs)
    const { tabs: _tabs, ...layout } = existing
    const merged = mergeLayoutForSave(existing, { ...layout, layoutMode: 'fullscreen' })
    expect(merged.tabs).toEqual(defaults)
    expect(merged.layoutMode).toBe('fullscreen')
    expect(readWorkspaceTabs('workspace', defaults)).toEqual(localTabs)
  })

  test('ordinary workspace saves retain their existing shared tab behavior', () => {
    const existing = createDefaultWorkspaceLayout()
    const tabs: WorkspaceTabsState = { open: ['overview', 'scratchpad'], active: 'scratchpad' }
    expect(mergeLayoutForSave(existing, { ...existing, tabs }).tabs).toEqual(tabs)
  })
})

describe('collab selected chat cache transitions', () => {
  test('supplying a current user switches the mounted chat observer to the saved tab chat', async () => {
    useBrowserTab(browserTab())
    writeBrowserTabSelectedSession('workspace', 'saved-tab-chat')
    const client = new QueryClient()
    const sharedKey = selectedSessionKey('workspace')
    client.setQueryData(sharedKey, { sessionId: 'old-shared-chat' })
    const options = { staleTime: Infinity, gcTime: 0, refetchOnMount: false as const }
    const selection = new QueryObserver<SelectedSessionState>(client, {
      ...options,
      queryKey: sharedKey,
      queryFn: async () => ({ sessionId: 'old-shared-chat' })
    })
    const stop = selection.subscribe(() => {})
    let stopInspect = () => {}
    let reads = 0
    try {
      selection.setOptions({
        ...options,
        queryKey: selectedSessionKey('workspace', 'browser-tab'),
        queryFn: async () => {
          reads++
          return { sessionId: readBrowserTabSelectedSession('workspace') }
        }
      })
      expect(selection.getCurrentResult().data).toBeUndefined()
      const selected = await new Promise<SelectedSessionState | undefined>(resolve => {
        const inspect = () => {
          const result = selection.getCurrentResult()
          if (result.isSuccess) resolve(result.data)
        }
        stopInspect = selection.subscribe(inspect)
        inspect()
      })
      expect(selected).toEqual({ sessionId: 'saved-tab-chat' })
      expect(reads).toBe(1)
    } finally {
      stopInspect()
      stop()
      client.clear()
    }
  })

  test('a late shared save and remote selection event cannot replace the current browser tab chat', () => {
    const client = new QueryClient()
    try {
      client.setQueryData(selectedSessionKey('workspace'), { sessionId: 'old-shared-chat' })
      const pendingShared = optimisticallySetSelectedSession(
        client,
        'workspace',
        'in-flight-shared-chat'
      )
      const pendingBrowserTab = optimisticallySetSelectedSession(
        client,
        'workspace',
        'browser-tab-chat',
        'browser-tab'
      )
      if (!pendingShared || !pendingBrowserTab) throw new Error('Expected pending selections')
      settleSelectedSessionSave(
        client,
        'workspace',
        { sessionId: 'in-flight-shared-chat' },
        pendingShared
      )
      applySelectedSessionEvent(client, 'workspace', 'remote-chat', false)
      expect(
        client.getQueryData<SelectedSessionState>(selectedSessionKey('workspace', 'browser-tab'))
      ).toEqual({
        sessionId: 'browser-tab-chat'
      })
      expect(client.getQueryData<SelectedSessionState>(selectedSessionKey('workspace'))).toEqual({
        sessionId: 'remote-chat'
      })
      settleSelectedSessionSave(
        client,
        'workspace',
        { sessionId: 'browser-tab-chat' },
        pendingBrowserTab,
        'browser-tab'
      )
      expect(
        client.getQueryData<SelectedSessionState>(selectedSessionKey('workspace', 'browser-tab'))
      ).toEqual({
        sessionId: 'browser-tab-chat'
      })
    } finally {
      client.clear()
    }
  })

  test('a session id replacement follows the selected browser tab chat into saved tab state', () => {
    useBrowserTab(browserTab())
    const client = new QueryClient()
    try {
      writeBrowserTabSelectedSession('workspace', 'temporary-id')
      client.setQueryData(selectedSessionKey('workspace', 'browser-tab'), {
        sessionId: 'temporary-id'
      })
      client.setQueryData(selectedSessionKey('workspace'), { sessionId: 'different-shared-chat' })
      renameSelectedSessionInCache(client, 'workspace', 'temporary-id', 'provider-id')
      expect(readBrowserTabSelectedSession('workspace')).toBe('provider-id')
      expect(
        client.getQueryData<SelectedSessionState>(selectedSessionKey('workspace', 'browser-tab'))
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
