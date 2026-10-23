// One-time import of the pre-0.13 global stores into per-workspace state,
// keyed by workspace path. Imports registered workspaces only, then deletes
// the old files. Delete this file after v0.14.
import { rm } from 'node:fs/promises'
import { join } from 'node:path'

import { DATA_DIR } from '../data-dir'
import { normalizeWorkspaceState } from './file'
import { hasWorkspaceState, updateWorkspaceState } from './index'
import type { WorkspaceRef } from './types'

type LegacySession = {
  tabId?: string
  config?: unknown
  forkedFromSessionId?: string
  forkedThroughMessageId?: string
  forkedNoticeIds?: string[]
}
type LegacySelection = { selected?: unknown; pinned?: unknown }
type LegacyView = { id: string; executionSessionId?: string }

export const LEGACY_FILES = [
  'sessions.json',
  'session-config.json',
  'selected-sessions.json',
  'pending-views.json',
  'view-builders.json'
]

function readLegacy<T>(dataDir: string, name: string): Promise<Record<string, T>> {
  return Bun.file(join(dataDir, name))
    .json()
    .catch(() => ({}))
}

export async function migrateLegacyWorkspaceState(
  workspaces: readonly WorkspaceRef[],
  dataDir = DATA_DIR
): Promise<void> {
  const sessions = await readLegacy<Record<string, LegacySession>>(dataDir, 'sessions.json')
  const selections = await readLegacy<LegacySelection>(dataDir, 'selected-sessions.json')
  const pendingViews = await readLegacy<LegacyView[]>(dataDir, 'pending-views.json')

  for (const ws of workspaces) {
    if (hasWorkspaceState(ws.id)) continue
    const state = normalizeWorkspaceState(
      {
        pinnedSessionId: selections[ws.path]?.pinned,
        selected: selections[ws.path]?.selected,
        sessions: Object.fromEntries(
          Object.entries(sessions[ws.path] ?? {}).map(([id, session]) => [
            id,
            {
              tabId: session.tabId,
              config: session.config,
              fork: session.forkedFromSessionId && {
                fromSessionId: session.forkedFromSessionId,
                throughMessageId: session.forkedThroughMessageId,
                noticeIds: session.forkedNoticeIds
              }
            }
          ])
        ),
        pendingViews: Object.fromEntries(
          (pendingViews[ws.path] ?? []).map(({ id, executionSessionId, ...view }) => [
            id,
            { ...view, buildSessionId: executionSessionId }
          ])
        )
      },
      ws.path
    )
    await updateWorkspaceState(ws, draft => {
      Object.assign(draft, state)
    })
  }

  for (const name of LEGACY_FILES) await rm(join(dataDir, name), { force: true })
}
