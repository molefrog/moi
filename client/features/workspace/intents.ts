// Client-local intent state and dispatch (docs/intents.md). Two things live
// here, both module-level so applet code and non-React callers can reach them:
//
//   - Ephemeral per-tab params: the values the last focus intent handed a tab.
//     In-memory only — deliberately NOT persisted into WorkspaceLayout, so a
//     reload starts every view without params.
//   - `focusTab(workspaceId, tab, params?)`: store the params and switch the
//     active tab through the mounted WorkspaceScreen's own tab mechanism.
//
// The screen registers its handlers via `bindWorkspaceIntents` while mounted;
// that same binding installs the typed `window.moi` bridge the applet-bundle
// `moi` module stubs delegate to (server/bundler/build-applet.ts).
import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

import type { MoiAppletRuntime, WorkspaceTabId } from '@/lib/types'

declare global {
  interface Window {
    moi?: MoiAppletRuntime
  }
}

// Entries are keyed `${workspaceId}:${tab}` — same convention as liveStore.
function key(workspaceId: string, tab: WorkspaceTabId): string {
  return `${workspaceId}:${tab}`
}

type IntentsStore = {
  paramsByTab: Record<string, Record<string, unknown>>
  setTabParams: (workspaceId: string, tab: WorkspaceTabId, params: Record<string, unknown>) => void
}

export const intentsStore = createStore<IntentsStore>()(set => ({
  paramsByTab: {},

  setTabParams: (workspaceId, tab, params) =>
    set(s => ({ paramsByTab: { ...s.paramsByTab, [key(workspaceId, tab)]: params } }))
}))

// Stable empty default so an unset tab never re-renders its subscribers.
const EMPTY_PARAMS: Record<string, unknown> = {}

export function getTabParams(workspaceId: string, tab: WorkspaceTabId): Record<string, unknown> {
  return intentsStore.getState().paramsByTab[key(workspaceId, tab)] ?? EMPTY_PARAMS
}

// Reactive read of one tab's current params — feeds the mounted view's
// `params` prop.
export function useTabParams(workspaceId: string, tab: WorkspaceTabId): Record<string, unknown> {
  return useStore(intentsStore, s => s.paramsByTab[key(workspaceId, tab)]) ?? EMPTY_PARAMS
}

// What a mounted WorkspaceScreen contributes: its tab switcher and the chat
// side of `sendAction` (send-or-park, see WorkspaceScreen).
type WorkspaceIntentHandlers = {
  openTab: (tab: WorkspaceTabId) => void
  sendAction: (label: string, context?: Record<string, unknown>, source?: string) => void
}

const handlers = new Map<string, WorkspaceIntentHandlers>()

// Dispatch a focus intent: remember the params for the target tab (when given —
// a bare focus keeps whatever the tab already holds), then activate it. Callers:
// the `intent:focus` workspace event (agent-initiated `moi focus`) and applet
// `focus()` calls via the `window.moi` bridge.
export function focusTab(
  workspaceId: string,
  tab: WorkspaceTabId,
  params?: Record<string, unknown>
): void {
  if (params) intentsStore.getState().setTabParams(workspaceId, tab, params)
  handlers.get(workspaceId)?.openTab(tab)
}

// Bind a mounted WorkspaceScreen to the intent system and install the
// `window.moi` applet bridge for its workspace. Returns the unbind cleanup.
// One workspace is on screen at a time, so a plain overwrite is safe; the
// cleanup only removes what it installed (a remount that already re-bound wins).
export function bindWorkspaceIntents(
  workspaceId: string,
  screen: WorkspaceIntentHandlers
): () => void {
  handlers.set(workspaceId, screen)
  const runtime: MoiAppletRuntime = {
    focus: (tab, params) => focusTab(workspaceId, tab, params),
    sendAction: (label, context, source) =>
      handlers.get(workspaceId)?.sendAction(label, context, source)
  }
  if (typeof window !== 'undefined') window.moi = runtime
  return () => {
    if (handlers.get(workspaceId) === screen) handlers.delete(workspaceId)
    if (typeof window !== 'undefined' && window.moi === runtime) delete window.moi
  }
}
