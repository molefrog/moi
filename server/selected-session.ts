import { mkdir, rename } from 'node:fs/promises'
import { join } from 'path'

import { DATA_DIR } from './data-dir'
import type { WorkspaceSessionSelection, WorkspaceTabId } from '@/lib/types'
import { isWorkspaceTabId } from '@/lib/workspace-tabs'

type Selection = WorkspaceSessionSelection
type Store = Record<string, Selection>
const emptySelection = (): Selection => ({ selected: {}, pinned: null })

export type SelectedSessionUpdate = {
  changed: boolean
  sessionId: string | null
}

export const DEFAULT_SELECTED_SESSION_PATH = join(DATA_DIR, 'selected-sessions.json')

let storePath = DEFAULT_SELECTED_SESSION_PATH
const renamedSessions = new Map<string, Map<string, string>>()

export function setSelectedSessionPath(path: string): void {
  storePath = path
  renamedSessions.clear()
}

function rememberSessionRename(workspacePath: string, from: string, to: string): void {
  const renames = renamedSessions.get(workspacePath) ?? new Map<string, string>()
  renames.set(from, to)
  renamedSessions.set(workspacePath, renames)
}

export function resolveRenamedSession(workspacePath: string, sessionId: string): string {
  const renames = renamedSessions.get(workspacePath)
  const seen = new Set<string>()
  while (renames?.has(sessionId) && !seen.has(sessionId)) {
    seen.add(sessionId)
    sessionId = renames.get(sessionId)!
  }
  return sessionId
}

async function readStore(): Promise<Store> {
  try {
    const parsed: unknown = JSON.parse(await Bun.file(storePath).text())
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    const store: Store = {}
    for (const [workspacePath, value] of Object.entries(parsed)) {
      if (value === null || typeof value === 'string') {
        store[workspacePath] = { selected: value === null ? {} : { overview: value }, pinned: null }
      } else if (value && typeof value === 'object' && 'selected' in value) {
        const entry = value as Selection
        store[workspacePath] = {
          selected: Object.fromEntries(
            Object.entries(entry.selected ?? {}).filter(([, id]) => typeof id === 'string')
          ),
          pinned: typeof entry.pinned === 'string' ? entry.pinned : null
        }
      }
    }
    return store
  } catch {
    return {}
  }
}

async function writeStore(store: Store): Promise<void> {
  await mkdir(join(storePath, '..'), { recursive: true })
  const temporaryPath = `${storePath}.${process.pid}.tmp`
  await Bun.write(temporaryPath, JSON.stringify(store, null, 2))
  await rename(temporaryPath, storePath)
}

let writeChain: Promise<unknown> = Promise.resolve()

function locked<T>(operation: () => Promise<T>): Promise<T> {
  const run = writeChain.then(operation, operation)
  writeChain = run.catch(() => {})
  return run
}

export async function getSelectedSession(
  workspacePath: string,
  tabId: WorkspaceTabId = 'overview'
): Promise<string | undefined> {
  const store = await readStore()
  return store[workspacePath]?.selected[tabId] ?? undefined
}

export async function getWorkspaceSessionSelection(
  workspacePath: string
): Promise<WorkspaceSessionSelection> {
  await writeChain
  return (await readStore())[workspacePath] ?? emptySelection()
}

export async function getPinnedSession(workspacePath: string): Promise<string | null> {
  return (await readStore())[workspacePath]?.pinned ?? null
}

export async function pinSession(workspacePath: string, sessionId: string | null): Promise<void> {
  await locked(async () => {
    const store = await readStore()
    const selection = (store[workspacePath] ??= emptySelection())
    selection.pinned = sessionId === null ? null : resolveRenamedSession(workspacePath, sessionId)
    await writeStore(store)
  })
}

export async function dropSessionTab(workspacePath: string, tabId: WorkspaceTabId): Promise<void> {
  await locked(async () => {
    const store = await readStore()
    const selection = store[workspacePath]
    if (!selection || !(tabId in selection.selected)) return
    delete selection.selected[tabId]
    await writeStore(store)
  })
}

export async function saveSelectedSession(
  workspacePath: string,
  sessionId: string | null,
  previousSessionId?: string | null,
  tabId: WorkspaceTabId = 'overview'
): Promise<SelectedSessionUpdate> {
  return locked(async () => {
    const store = await readStore()
    const selection = (store[workspacePath] ??= emptySelection())
    const current = selection.selected[tabId]
    const resolvedSessionId =
      sessionId === null ? null : resolveRenamedSession(workspacePath, sessionId)
    const resolvedPreviousSessionId =
      previousSessionId == null
        ? previousSessionId
        : resolveRenamedSession(workspacePath, previousSessionId)

    if (
      resolvedPreviousSessionId !== undefined &&
      (current ?? null) !== resolvedPreviousSessionId
    ) {
      return { changed: false, sessionId: current ?? null }
    }
    if ((current ?? null) === resolvedSessionId)
      return { changed: false, sessionId: resolvedSessionId }

    if (resolvedSessionId === null) delete selection.selected[tabId]
    else selection.selected[tabId] = resolvedSessionId
    await writeStore(store)
    return { changed: true, sessionId: resolvedSessionId }
  })
}

export async function renameSelectedSession(
  workspacePath: string,
  from: string,
  to: string
): Promise<SelectedSessionUpdate> {
  if (from === to) return { changed: false, sessionId: to }
  return locked(async () => {
    rememberSessionRename(workspacePath, from, to)
    const store = await readStore()
    const selection = (store[workspacePath] ??= emptySelection())
    let changed = false
    for (const tabId of Object.keys(selection.selected).filter(isWorkspaceTabId)) {
      if (selection.selected[tabId] !== from) continue
      selection.selected[tabId] = to
      changed = true
    }
    if (selection.pinned === from) {
      selection.pinned = to
      changed = true
    }
    if (changed) await writeStore(store)
    return { changed, sessionId: selection.selected.overview ?? null }
  })
}

export async function clearSelectedSession(
  workspacePath: string,
  sessionId: string
): Promise<SelectedSessionUpdate> {
  return locked(async () => {
    const store = await readStore()
    const selection = (store[workspacePath] ??= emptySelection())
    let changed = false
    for (const tabId of Object.keys(selection.selected).filter(isWorkspaceTabId)) {
      if (selection.selected[tabId] !== sessionId) continue
      delete selection.selected[tabId]
      changed = true
    }
    if (selection.pinned === sessionId) {
      selection.pinned = null
      changed = true
    }
    if (changed) await writeStore(store)
    return { changed, sessionId: selection.selected.overview ?? null }
  })
}
