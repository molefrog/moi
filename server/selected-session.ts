import { mkdir, rename } from 'node:fs/promises'
import { join } from 'path'

import { DATA_DIR } from './data-dir'

type Store = Record<string, string | null>

export type SelectedSessionUpdate = {
  changed: boolean
  sessionId: string | null
}

export const DEFAULT_SELECTED_SESSION_PATH = join(DATA_DIR, 'selected-sessions.json')

let storePath = DEFAULT_SELECTED_SESSION_PATH

export function setSelectedSessionPath(path: string): void {
  storePath = path
}

async function readStore(): Promise<Store> {
  try {
    const parsed: unknown = JSON.parse(await Bun.file(storePath).text())
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    const store: Store = {}
    for (const [workspacePath, sessionId] of Object.entries(parsed)) {
      if (sessionId === null || typeof sessionId === 'string') {
        store[workspacePath] = sessionId
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
  workspacePath: string
): Promise<string | null | undefined> {
  const store = await readStore()
  return Object.prototype.hasOwnProperty.call(store, workspacePath)
    ? store[workspacePath]
    : undefined
}

export async function initializeSelectedSession(
  workspacePath: string,
  fallbackSessionId: string | null
): Promise<string | null> {
  return locked(async () => {
    const store = await readStore()
    if (Object.prototype.hasOwnProperty.call(store, workspacePath)) {
      return store[workspacePath]
    }
    store[workspacePath] = fallbackSessionId
    await writeStore(store)
    return fallbackSessionId
  })
}

export async function saveSelectedSession(
  workspacePath: string,
  sessionId: string | null,
  previousSessionId?: string | null
): Promise<SelectedSessionUpdate> {
  return locked(async () => {
    const store = await readStore()
    const current = Object.prototype.hasOwnProperty.call(store, workspacePath)
      ? store[workspacePath]
      : undefined
    if (previousSessionId !== undefined && current !== previousSessionId) {
      return { changed: false, sessionId: current ?? null }
    }
    if (current === sessionId) return { changed: false, sessionId }

    store[workspacePath] = sessionId
    await writeStore(store)
    return { changed: true, sessionId }
  })
}

export async function renameSelectedSession(
  workspacePath: string,
  from: string,
  to: string
): Promise<SelectedSessionUpdate> {
  if (from === to) return { changed: false, sessionId: to }
  return locked(async () => {
    const store = await readStore()
    const current = Object.prototype.hasOwnProperty.call(store, workspacePath)
      ? store[workspacePath]
      : undefined
    if (current !== from) return { changed: false, sessionId: current ?? null }

    store[workspacePath] = to
    await writeStore(store)
    return { changed: true, sessionId: to }
  })
}

export async function clearSelectedSession(
  workspacePath: string,
  sessionId: string
): Promise<SelectedSessionUpdate> {
  return locked(async () => {
    const store = await readStore()
    const current = Object.prototype.hasOwnProperty.call(store, workspacePath)
      ? store[workspacePath]
      : undefined
    if (current !== sessionId) return { changed: false, sessionId: current ?? null }

    store[workspacePath] = null
    await writeStore(store)
    return { changed: true, sessionId: null }
  })
}
