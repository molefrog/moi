import { afterEach, describe, expect, test } from 'bun:test'
import { QueryClient, QueryObserver } from '@tanstack/react-query'

import {
  applySelectedSessionEvent,
  optimisticallySetSelectedSession,
  renameSelectedSessionInCache,
  selectedSessionKey,
  settleSelectedSessionSave
} from '@/client/features/chat/sessions/useSelectedSession'
import type { WorkspaceSessionSelection, WorkspaceTabsState } from '@/lib/types'
import { createDefaultWorkspaceLayout } from '@/lib/workspace-layout'
import { mergeLayoutForSave } from '@/server/layout'

import { readWorkspaceTabs, writeWorkspaceTabs } from './browser-tab-state'
import {
  readSelectedSession,
  writeSelectedSession
} from '@/client/features/chat/sessions/browser-tab-state'

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
const selection = (selected: WorkspaceSessionSelection['selected']): WorkspaceSessionSelection => ({
  selected,
  pinned: null
})

describe('collab browser tab state', () => {
  test('two browser tabs select per-view chats independently, including New chat', () => {
    const anna = browserTab()
    const boris = browserTab()
    useBrowserTab(anna)
    writeSelectedSession(
      'workspace',
      selection({ overview: 'annas-chat', 'views/board': 'board-chat' })
    )
    useBrowserTab(boris)
    expect(readSelectedSession('workspace')).toEqual(selection({}))
    writeSelectedSession('workspace', selection({ overview: 'boris-chat' }))
    useBrowserTab(anna)
    expect(readSelectedSession('workspace')).toEqual(
      selection({ overview: 'annas-chat', 'views/board': 'board-chat' })
    )
    writeSelectedSession('workspace', selection({ 'views/board': 'board-chat' }))
    expect(readSelectedSession('workspace')).toEqual(selection({ 'views/board': 'board-chat' }))
    useBrowserTab(boris)
    expect(readSelectedSession('workspace')).toEqual(selection({ overview: 'boris-chat' }))
  })

  test('browser tab chat and view choices survive reads and stay partitioned by workspace', () => {
    useBrowserTab(browserTab())
    const selected: WorkspaceTabsState = {
      open: ['overview', 'views/board'],
      active: 'views/board'
    }
    writeSelectedSession('one', selection({ overview: 'chat-one' }))
    writeSelectedSession('two', selection({ overview: 'chat-two' }))
    writeWorkspaceTabs('one', selected)
    expect(readSelectedSession('one')).toEqual(selection({ overview: 'chat-one' }))
    expect(readSelectedSession('two')).toEqual(selection({ overview: 'chat-two' }))
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
    expect(readSelectedSession('workspace')).toEqual(selection({}))
    expect(readWorkspaceTabs('workspace', defaults)).toEqual(defaults)
    expect(() => writeSelectedSession('workspace', selection({ overview: 'chat' }))).not.toThrow()
    expect(() => writeWorkspaceTabs('workspace', defaults)).not.toThrow()
  })

  test('an optimistic view selection survives reload without changing shared selection', () => {
    useBrowserTab(browserTab())
    const client = new QueryClient()
    client.setQueryData(selectedSessionKey('workspace'), selection({ overview: 'shared-chat' }))
    client.setQueryData(selectedSessionKey('workspace', 'browser-tab'), selection({}))

    optimisticallySetSelectedSession(client, 'workspace', 'view-chat', 'views/board', 'browser-tab')

    expect(readSelectedSession('workspace')).toEqual(selection({ 'views/board': 'view-chat' }))
    expect(client.getQueryData<WorkspaceSessionSelection>(selectedSessionKey('workspace'))).toEqual(
      selection({ overview: 'shared-chat' })
    )
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
    writeSelectedSession('workspace', selection({ overview: 'saved-tab-chat' }))
    const client = new QueryClient()
    const sharedKey = selectedSessionKey('workspace')
    client.setQueryData(sharedKey, selection({ overview: 'old-shared-chat' }))
    const options = { staleTime: Infinity, gcTime: 0, refetchOnMount: false as const }
    const observer = new QueryObserver<WorkspaceSessionSelection>(client, {
      ...options,
      queryKey: sharedKey,
      queryFn: async () => selection({ overview: 'old-shared-chat' })
    })
    const stop = observer.subscribe(() => {})
    let stopInspect = () => {}
    let reads = 0
    try {
      observer.setOptions({
        ...options,
        queryKey: selectedSessionKey('workspace', 'browser-tab'),
        queryFn: async () => {
          reads++
          return readSelectedSession('workspace')
        }
      })
      expect(observer.getCurrentResult().data).toBeUndefined()
      const selected = await new Promise<WorkspaceSessionSelection | undefined>(resolve => {
        const inspect = () => {
          const result = observer.getCurrentResult()
          if (result.isSuccess) resolve(result.data)
        }
        stopInspect = observer.subscribe(inspect)
        inspect()
      })
      expect(selected).toEqual(selection({ overview: 'saved-tab-chat' }))
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
      client.setQueryData(
        selectedSessionKey('workspace'),
        selection({ overview: 'old-shared-chat' })
      )
      const pendingShared = optimisticallySetSelectedSession(
        client,
        'workspace',
        'in-flight-shared-chat',
        'overview'
      )
      client.setQueryData(selectedSessionKey('workspace', 'browser-tab'), selection({}))
      const pendingBrowserTab = optimisticallySetSelectedSession(
        client,
        'workspace',
        'browser-tab-chat',
        'views/board',
        'browser-tab'
      )
      if (!pendingShared || !pendingBrowserTab) throw new Error('Expected pending selections')
      settleSelectedSessionSave(
        client,
        'workspace',
        { sessionId: 'in-flight-shared-chat' },
        pendingShared
      )
      applySelectedSessionEvent(client, 'workspace', false)
      expect(
        client.getQueryData<WorkspaceSessionSelection>(
          selectedSessionKey('workspace', 'browser-tab')
        )
      ).toEqual(selection({ 'views/board': 'browser-tab-chat' }))
      expect(client.getQueryState(selectedSessionKey('workspace'))?.isInvalidated).toBe(true)
      settleSelectedSessionSave(
        client,
        'workspace',
        { sessionId: 'browser-tab-chat' },
        pendingBrowserTab
      )
      expect(
        client.getQueryData<WorkspaceSessionSelection>(
          selectedSessionKey('workspace', 'browser-tab')
        )
      ).toEqual(selection({ 'views/board': 'browser-tab-chat' }))
    } finally {
      client.clear()
    }
  })

  test('a session id replacement follows the selected browser tab chat into saved tab state', () => {
    useBrowserTab(browserTab())
    const client = new QueryClient()
    try {
      writeSelectedSession('workspace', selection({ 'views/board': 'temporary-id' }))
      client.setQueryData(selectedSessionKey('workspace', 'browser-tab'), {
        selected: { 'views/board': 'temporary-id' },
        pinned: null
      })
      client.setQueryData(
        selectedSessionKey('workspace'),
        selection({ overview: 'different-shared-chat' })
      )
      renameSelectedSessionInCache(client, 'workspace', 'temporary-id', 'provider-id')
      expect(readSelectedSession('workspace')).toEqual(selection({ 'views/board': 'provider-id' }))
      expect(
        client.getQueryData<WorkspaceSessionSelection>(
          selectedSessionKey('workspace', 'browser-tab')
        )
      ).toEqual(selection({ 'views/board': 'provider-id' }))
      expect(
        client.getQueryData<WorkspaceSessionSelection>(selectedSessionKey('workspace'))
      ).toEqual(selection({ overview: 'different-shared-chat' }))
    } finally {
      client.clear()
    }
  })
})
