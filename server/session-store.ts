import { mkdir, rename } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type {
  SessionConfig,
  SessionRecord,
  SessionRecordPatch,
  SessionInfo,
  SessionSummary,
  WorkspaceTabId
} from '@/lib/types'
import { DATA_DIR } from './data-dir'

type Store = Record<string, Record<string, SessionRecord>>
export const DEFAULT_SESSION_STORE_PATH = join(DATA_DIR, 'sessions.json')
let storePath = DEFAULT_SESSION_STORE_PATH
let writes: Promise<unknown> = Promise.resolve()

export function setSessionStorePath(path: string) {
  storePath = path
}

async function readFile<T>(path: string): Promise<T | undefined> {
  const file = Bun.file(path)
  return (await file.exists()) ? file.json() : undefined
}

async function read(): Promise<Store> {
  const stored = await readFile<Store>(storePath)
  if (stored) return stored
  // Import old files until the first unified write; leave the originals intact.
  const directory = dirname(storePath)
  const configs = await readFile<Record<string, Record<string, SessionConfig>>>(
    join(directory, 'session-config.json')
  )
  const store: Store = {}
  for (const [workspace, sessions] of Object.entries(configs ?? {})) {
    const records = (store[workspace] ??= {})
    for (const [id, config] of Object.entries(sessions)) records[id] = { ...records[id], config }
  }
  return store
}

export async function getSessionRecords(workspacePath: string) {
  await writes
  return (await read())[workspacePath] ?? {}
}

export async function getSessionRecord(
  workspacePath: string,
  sessionId: string
): Promise<SessionRecord> {
  return (await getSessionRecords(workspacePath))[sessionId] ?? {}
}

export async function updateSessionRecords<T>(
  workspacePath: string,
  change: (sessions: Record<string, SessionRecord>) => T
) {
  const run = writes.then(async () => {
    const store = await read()
    const sessions = (store[workspacePath] ??= {})
    const result = change(sessions)
    if (result === false) return result
    for (const [id, record] of Object.entries(sessions)) {
      if (Object.keys(record).length === 0) delete sessions[id]
    }
    if (Object.keys(sessions).length === 0) delete store[workspacePath]
    await mkdir(dirname(storePath), { recursive: true })
    const temp = `${storePath}.${process.pid}.tmp`
    await Bun.write(temp, JSON.stringify(store, null, 2))
    await rename(temp, storePath)
    return result
  })
  writes = run.catch(() => {})
  return run
}

export async function renameSessionRecord(workspacePath: string, from: string, to: string) {
  if (from === to) return
  await updateSessionRecords(workspacePath, sessions => {
    if (sessions[from]) {
      const source = sessions[from]
      const target = sessions[to]
      sessions[to] = {
        ...source,
        ...target,
        ...(source.config || target?.config
          ? { config: { ...source.config, ...target?.config } }
          : {})
      }
      delete sessions[from]
    }
    for (const record of Object.values(sessions)) {
      if (record.forkedFromSessionId === from) record.forkedFromSessionId = to
    }
  })
}

export async function withSessionRecords(
  workspacePath: string,
  sessions: SessionSummary[]
): Promise<SessionInfo[]> {
  const records = await getSessionRecords(workspacePath)
  return sessions.map(session => {
    const { config: _, ...metadata } = records[session.sessionId] ?? {}
    return { ...session, ...metadata }
  })
}

export async function patchSessionRecord(
  workspacePath: string,
  sessionId: string,
  metadata: SessionRecordPatch
) {
  await updateSessionRecords(workspacePath, sessions => {
    const next = { ...sessions[sessionId], ...metadata }
    assertSessionRecord(next)
    sessions[sessionId] = next
  })
}

function assertSessionRecord(record: Partial<SessionRecord>): asserts record is SessionRecord {
  if (
    record.forkedFromSessionId === undefined &&
    (record.forkedThroughMessageId !== undefined || record.forkedNoticeIds !== undefined)
  )
    throw new Error('Fork history requires a source session')
}

export async function clearSessionRecordTab(workspacePath: string, tabId: WorkspaceTabId) {
  return updateSessionRecords(workspacePath, sessions => {
    let changed = false
    for (const metadata of Object.values(sessions)) {
      if (metadata.tabId !== tabId) continue
      changed = true
      delete metadata.tabId
    }
    return changed
  })
}
