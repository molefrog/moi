// The one place an env change takes effect. Env is frozen at spawn, so after
// any write — the settings UI's PUT /env or a CLI `moi env set`/`unset`
// relayed over the control port — the workspace's processes must be reaped and
// every connected client told to refetch. Both entry points call this so the
// side effects can never drift apart.
import { restartWorkspaceSessions } from './cc-session'
import { publishEvent } from './events'
import { restartWorker } from './functions'

export function applyEnvChanged(workspace: { id: string; path: string }): void {
  // Kill the cached widget worker (next RPC respawns with fresh env) and tear
  // down idle agent sessions (busy ones keep their snapshot until turn end).
  restartWorker(workspace.path)
  restartWorkspaceSessions(workspace.path)
  publishEvent({ type: 'env:updated', workspaceId: workspace.id })
}
