// Server-owned agent state: the availability cache and the login ceremony.
//
// The client never polls for auth. `GET /api/workspaces/:id/agent` serves the
// snapshot from this store (one probe per workspace inside the TTL, however
// many tabs are open); `POST .../auth/login` starts — or joins — the single
// ceremony per workspace. While a ceremony is pending, a watch loop re-probes
// the provider until the login lands or the deadline passes, and every
// transition is pushed to all tabs as an `agent:updated` event on the
// workspace events socket.
import type {
  AgentLoginState,
  HarnessAvailability,
  HarnessLogin,
  WorkspaceEntry
} from '@/lib/types'

import { publishEvent } from './events'
import { harnessFor } from './harness/registry'

export type AgentUpdatedEvent = {
  type: 'agent:updated'
  workspaceId: string
  availability: HarnessAvailability
  login?: AgentLoginState
}

export type AgentStoreOptions = {
  probe: (ws: WorkspaceEntry) => Promise<HarnessAvailability>
  startLogin: (ws: WorkspaceEntry) => Promise<HarnessLogin>
  publish: (event: AgentUpdatedEvent) => void
  availabilityTtlMs?: number
  loginPollMs?: number
  loginDeadlineMs?: number
}

type LoginCeremony = {
  state: AgentLoginState
  // The in-flight provider call; joiners await it instead of starting a
  // second flow. Cleared once settled.
  starting?: Promise<HarnessLogin>
  stop: () => void
}

type AgentEntry = {
  cached?: { value: HarnessAvailability; checkedAt: number }
  // In-flight probe, shared by concurrent callers.
  probe?: Promise<HarnessAvailability>
  login?: LoginCeremony
}

export function createAgentStore(options: AgentStoreOptions) {
  const ttlMs = options.availabilityTtlMs ?? 30_000
  const pollMs = options.loginPollMs ?? 2_000
  const deadlineMs = options.loginDeadlineMs ?? 3 * 60_000
  const entries = new Map<string, AgentEntry>()

  function entryFor(workspaceId: string): AgentEntry {
    let entry = entries.get(workspaceId)
    if (!entry) {
      entry = {}
      entries.set(workspaceId, entry)
    }
    return entry
  }

  function publish(workspaceId: string, availability: HarnessAvailability) {
    const login = entries.get(workspaceId)?.login?.state
    options.publish({
      type: 'agent:updated',
      workspaceId,
      availability,
      ...(login ? { login } : {})
    })
  }

  async function probeFresh(ws: WorkspaceEntry): Promise<HarnessAvailability> {
    const entry = entryFor(ws.id)
    if (!entry.probe) {
      entry.probe = options.probe(ws).finally(() => {
        entry.probe = undefined
      })
    }
    const value = await entry.probe
    entry.cached = { value, checkedAt: Date.now() }
    return value
  }

  async function getAvailability(ws: WorkspaceEntry): Promise<HarnessAvailability> {
    const entry = entryFor(ws.id)
    if (entry.cached && Date.now() - entry.cached.checkedAt < ttlMs) {
      return entry.cached.value
    }
    return probeFresh(ws)
  }

  function getLogin(workspaceId: string): AgentLoginState | undefined {
    return entries.get(workspaceId)?.login?.state
  }

  // Re-probe until the login lands or the deadline passes. One loop per
  // ceremony; a replaced or completed ceremony stops its loop.
  function watch(ws: WorkspaceEntry, login: LoginCeremony) {
    const deadline = Date.now() + deadlineMs
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    login.stop = () => {
      stopped = true
      clearTimeout(timer)
    }
    const tick = async () => {
      let value: HarnessAvailability
      try {
        value = await probeFresh(ws)
      } catch {
        value = { available: false, reason: 'Could not verify the login' }
      }
      if (stopped) return
      const entry = entryFor(ws.id)
      if (value.available) {
        entry.login = undefined
        publish(ws.id, value)
        return
      }
      if (Date.now() >= deadline) {
        // Keep the failed state so the composer can show it; the next
        // startLogin replaces it.
        login.state = { state: 'failed', reason: 'Sign-in did not complete. Try again' }
        publish(ws.id, value)
        return
      }
      timer = setTimeout(tick, pollMs)
      timer.unref?.()
    }
    // Unref'd so a pending ceremony never keeps the process alive on its own.
    timer = setTimeout(tick, pollMs)
    timer.unref?.()
  }

  async function startLogin(ws: WorkspaceEntry): Promise<HarnessLogin> {
    const entry = entryFor(ws.id)
    // Join the in-flight ceremony instead of starting a second provider flow
    // (two tabs, a remount, a double-click — all land here).
    const current = entry.login
    if (current?.starting) return current.starting
    if (current?.state.state === 'pending') return { url: current.state.url }

    current?.stop()
    const starting = options.startLogin(ws)
    const login: LoginCeremony = { state: { state: 'pending' }, starting, stop: () => {} }
    entry.login = login
    try {
      const result = await starting
      login.starting = undefined
      login.state = { state: 'pending', ...(result.url ? { url: result.url } : {}) }
      publish(ws.id, entry.cached?.value ?? { available: false, reason: 'Waiting for sign-in' })
      watch(ws, login)
      return result
    } catch (err) {
      entry.login = undefined
      throw err
    }
  }

  // Drop the cached snapshot so the next read re-probes (e.g. after an env
  // change swaps credentials).
  function invalidate(workspaceId: string) {
    const entry = entries.get(workspaceId)
    if (entry) entry.cached = undefined
  }

  return { getAvailability, getLogin, startLogin, invalidate }
}

export type AgentStore = ReturnType<typeof createAgentStore>

export const agentStore = createAgentStore({
  probe: async ws => (await harnessFor(ws).availability?.(ws)) ?? { available: true },
  startLogin: ws => {
    const start = harnessFor(ws).startLogin
    if (!start) throw new Error('This agent requires terminal sign-in')
    return start(ws)
  },
  publish: publishEvent
})
