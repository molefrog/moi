import { afterEach, describe, expect, test } from 'bun:test'
import { QueryClient, QueryObserver } from '@tanstack/react-query'

import {
  browserTabSelectionKey,
  browserTabSelectionOptions,
  cachedSelectedSession,
  renameSelectedSessionInCache,
  selectedSessionForTab,
  setSelectedSessionInCache
} from '@/client/features/chat/sessions/use-selected-session'
import { receiveWorkspaceState } from '@/client/features/workspace/workspace-state'
import type { SessionSummary, WorkspaceState, WorkspaceTabsState } from '@/lib/types'
import { createDefaultWorkspaceLayout } from '@/lib/workspace-layout'
import { workspaceKeys } from '@/client/api/workspace-keys'
import { reduceChatFrame } from '@/client/features/chat/connection/chat-frames'
import { mergeLayoutForSave } from '@/server/workspaces/layout'

import { readWorkspaceTabs, writeWorkspaceTabs } from './browser-tab-state'
import {
  readSelectedSession,
  writeSelectedSession,
  type BrowserTabSelection
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
const selection = (selected: BrowserTabSelection['selected']): BrowserTabSelection => ({
  selected
})
const workspaceState = (
  selected: WorkspaceState['selected'],
  pinnedSessionId?: string
): WorkspaceState => ({
  revision: 1,
  selected,
  sessions: {},
  pendingViews: {},
  ...(pinnedSessionId ? { pinnedSessionId } : {})
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
    client.setQueryData(
      workspaceKeys.state('workspace'),
      workspaceState({ overview: 'shared-chat' })
    )
    client.setQueryData(browserTabSelectionKey('workspace'), selection({}))

    setSelectedSessionInCache(client, 'workspace', 'view-chat', 'views/board', 'browser-tab')

    expect(readSelectedSession('workspace')).toEqual(selection({ 'views/board': 'view-chat' }))
    expect(client.getQueryData<WorkspaceState>(workspaceKeys.state('workspace'))).toEqual(
      workspaceState({ overview: 'shared-chat' })
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
  test('archive notifications clear each browser tab without changing unrelated chats or workspaces', () => {
    const anna = browserTab()
    const boris = browserTab()
    for (const [storage, ownChat] of [
      [anna, 'annas-chat'],
      [boris, 'boris-chat']
    ] as const) {
      useBrowserTab(storage)
      const client = new QueryClient()
      try {
        const local = selection({
          overview: ownChat,
          'views/board': 'archived-chat',
          scratchpad: null
        })
        writeSelectedSession('workspace', local)
        writeSelectedSession('other', selection({ overview: 'archived-chat' }))
        client.setQueryData(browserTabSelectionKey('workspace'), local)
        client.setQueryData(
          workspaceKeys.state('workspace'),
          workspaceState({ overview: 'shared-chat', 'views/board': 'cli-child' }, 'unrelated-pin')
        )
        client.setQueryData(
          workspaceKeys.state('other'),
          workspaceState({ overview: 'archived-chat' }, 'archived-chat')
        )
        client.setQueryData(workspaceKeys.sessions('workspace'), [
          { sessionId: 'archived-chat', summary: 'Board', lastModified: 1 },
          { sessionId: ownChat, summary: 'Own chat', lastModified: 2 }
        ])
        client.setQueryData(workspaceKeys.events('workspace', 'archived-chat'), {})
        reduceChatFrame(
          {
            type: 'session_archived',
            workspaceId: 'workspace',
            sessionId: 'archived-chat'
          },
          { queryClient: client, sendMessage: () => {}, onWorkspaceSwitch: null }
        )
        const expected = selection({ overview: ownChat, 'views/board': null, scratchpad: null })
        expect(readSelectedSession('workspace')).toEqual(expected)
        expect(
          client.getQueryData<BrowserTabSelection>(browserTabSelectionKey('workspace'))
        ).toEqual(expected)
        const shared = client.getQueryData<WorkspaceState>(workspaceKeys.state('workspace'))!
        expect(shared.pinnedSessionId).toBe('unrelated-pin')
        expect(
          selectedSessionForTab({ ...shared, pinnedSessionId: undefined }, 'views/board', expected)
        ).toBeNull()
        expect(readSelectedSession('other')).toEqual(selection({ overview: 'archived-chat' }))
        expect(client.getQueryData<WorkspaceState>(workspaceKeys.state('other'))).toEqual(
          workspaceState({ overview: 'archived-chat' }, 'archived-chat')
        )
        expect(client.getQueryData<SessionSummary[]>(workspaceKeys.sessions('workspace'))).toEqual([
          { sessionId: ownChat, summary: 'Own chat', lastModified: 2 }
        ])
        expect(
          client.getQueryData(workspaceKeys.events('workspace', 'archived-chat'))
        ).toBeUndefined()
      } finally {
        client.clear()
      }
    }
  })

  test('archiving clears a shared pin and saved selections even before the browser tab cache mounts', () => {
    useBrowserTab(browserTab())
    const client = new QueryClient()
    try {
      writeSelectedSession('workspace', selection({ overview: 'archived-chat' }))
      client.setQueryData(
        workspaceKeys.state('workspace'),
        workspaceState({ overview: 'archived-chat', scratchpad: 'other-chat' }, 'archived-chat')
      )
      reduceChatFrame(
        {
          type: 'session_archived',
          workspaceId: 'workspace',
          sessionId: 'archived-chat'
        },
        { queryClient: client, sendMessage: () => {}, onWorkspaceSwitch: null }
      )
      expect(client.getQueryData<WorkspaceState>(workspaceKeys.state('workspace'))).toEqual(
        workspaceState({ scratchpad: 'other-chat' })
      )
      expect(readSelectedSession('workspace')).toEqual(selection({ overview: null }))
    } finally {
      client.clear()
    }
  })

  test('ordinary session metadata updates preserve browser tab choices and shared pins', () => {
    useBrowserTab(browserTab())
    const client = new QueryClient()
    try {
      const local = selection({ overview: 'chat', 'views/board': null })
      const shared = workspaceState({ overview: 'chat' }, 'chat')
      writeSelectedSession('workspace', local)
      client.setQueryData(browserTabSelectionKey('workspace'), local)
      client.setQueryData(workspaceKeys.state('workspace'), shared)
      reduceChatFrame(
        { type: 'sessions_changed', workspaceId: 'workspace', sessionId: 'chat' },
        { queryClient: client, sendMessage: () => {}, onWorkspaceSwitch: null }
      )
      expect(readSelectedSession('workspace')).toEqual(local)
      expect(client.getQueryData<BrowserTabSelection>(browserTabSelectionKey('workspace'))).toEqual(
        local
      )
      expect(client.getQueryData<WorkspaceState>(workspaceKeys.state('workspace'))).toEqual(shared)
    } finally {
      client.clear()
    }
  })

  test('turning on the browser tab selection reads the saved tab chat once', async () => {
    const storage = browserTab()
    const getItem = storage.getItem
    let reads = 0
    storage.getItem = key => {
      reads++
      return getItem(key)
    }
    useBrowserTab(storage)
    writeSelectedSession('workspace', selection({ overview: 'saved-tab-chat' }))
    const client = new QueryClient()
    const observer = new QueryObserver<BrowserTabSelection>(client, {
      ...browserTabSelectionOptions('workspace'),
      enabled: false
    })
    const stop = observer.subscribe(() => {})
    let stopInspect = () => {}
    try {
      expect(observer.getCurrentResult().data).toBeUndefined()
      observer.setOptions({ ...browserTabSelectionOptions('workspace'), enabled: true })
      const selected = await new Promise<BrowserTabSelection | undefined>(resolve => {
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

  test('shared selection changes from this tab or others never replace the browser tab chat', () => {
    useBrowserTab(browserTab())
    const client = new QueryClient()
    try {
      client.setQueryData(
        workspaceKeys.state('workspace'),
        workspaceState({ overview: 'old-shared-chat' })
      )
      client.setQueryData(browserTabSelectionKey('workspace'), selection({}))
      setSelectedSessionInCache(client, 'workspace', 'in-flight-shared-chat', 'overview', 'shared')
      setSelectedSessionInCache(
        client,
        'workspace',
        'browser-tab-chat',
        'views/board',
        'browser-tab'
      )
      receiveWorkspaceState(client, 'workspace', {
        ...workspaceState({ overview: 'remote-chat', 'views/board': 'remote-board-chat' }),
        revision: 2
      })
      expect(client.getQueryData<BrowserTabSelection>(browserTabSelectionKey('workspace'))).toEqual(
        selection({ 'views/board': 'browser-tab-chat' })
      )
      expect(cachedSelectedSession(client, 'workspace', 'views/board', 'browser-tab')).toBe(
        'browser-tab-chat'
      )
      expect(cachedSelectedSession(client, 'workspace', 'overview', 'browser-tab')).toBe(
        'remote-chat'
      )
    } finally {
      client.clear()
    }
  })

  test('a session id replacement follows the selected browser tab chat into saved tab state', () => {
    useBrowserTab(browserTab())
    const client = new QueryClient()
    try {
      writeSelectedSession('workspace', selection({ 'views/board': 'temporary-id' }))
      client.setQueryData(
        browserTabSelectionKey('workspace'),
        selection({ 'views/board': 'temporary-id' })
      )
      client.setQueryData(
        workspaceKeys.state('workspace'),
        workspaceState({ overview: 'different-shared-chat' })
      )
      renameSelectedSessionInCache(client, 'workspace', 'temporary-id', 'provider-id')
      expect(readSelectedSession('workspace')).toEqual(selection({ 'views/board': 'provider-id' }))
      expect(client.getQueryData<BrowserTabSelection>(browserTabSelectionKey('workspace'))).toEqual(
        selection({ 'views/board': 'provider-id' })
      )
      expect(client.getQueryData<WorkspaceState>(workspaceKeys.state('workspace'))).toEqual(
        workspaceState({ overview: 'different-shared-chat' })
      )
    } finally {
      client.clear()
    }
  })
})
