// Login is global per harness. Workspace readiness is checked independently
// using each workspace’s environment.
import type {
  HarnessLoginState,
  HarnessAvailability,
  HarnessLogin,
  WorkspaceType
} from '@/lib/types'

import { listWorkspaces } from '../registry'
import { publishEvent } from '../events'
import { harnessFor } from './registry'
import type { HarnessWorkspace, HarnessLoginAttempt } from './types'

export type HarnessUpdatedEvent = {
  type: 'harness:updated'
  workspaceId: string
  availability: HarnessAvailability
}

// Readiness can target a harness account or an individual workspace.
type HarnessTarget = WorkspaceType | HarnessWorkspace

function entryKey(context: HarnessTarget): string {
  return typeof context === 'string' ? `default:${context}` : `workspace:${context.id}`
}

export type HarnessStoreOptions = {
  probe: (ws: HarnessTarget) => Promise<HarnessAvailability>
  startLogin: (type: WorkspaceType) => Promise<HarnessLoginAttempt>
  publish: (event: HarnessUpdatedEvent) => void
  onAuthChanged?: (type: WorkspaceType) => Promise<void>
  availabilityTtlMs?: number
  loginPollMs?: number
  loginDeadlineMs?: number
}

type LoginCeremony = {
  state: HarnessLoginState
  // The in-flight provider call; joiners await it instead of starting a
  // second flow. Cleared once settled.
  starting?: Promise<HarnessLogin>
  stop: () => void
  attempt?: HarnessLoginAttempt
  completed?: boolean
}

type HarnessEntry = {
  cached?: { value: HarnessAvailability; checkedAt: number }
  // In-flight probe, shared by concurrent callers.
  probe?: Promise<HarnessAvailability>
  login?: LoginCeremony
}

function failedProbeAvailability(ws: HarnessTarget, err: unknown): HarnessAvailability {
  console.error(`[harness-auth] availability probe failed for ${harnessFor(ws).id}`, err)
  return { status: 'unavailable', reason: 'Could not check agent availability' }
}

function sameAvailability(a: HarnessAvailability, b: HarnessAvailability): boolean {
  if (a.status !== b.status) return false
  if (a.status === 'available' || b.status === 'available') return true
  return (
    a.reason === b.reason &&
    (a.status !== 'unavailable' || b.status !== 'unavailable' || a.code === b.code)
  )
}

export function createHarnessStore(options: HarnessStoreOptions) {
  const ttlMs = options.availabilityTtlMs ?? 30_000
  const pollMs = options.loginPollMs ?? 2_000
  const deadlineMs = options.loginDeadlineMs ?? 10 * 60_000
  const entries = new Map<string, HarnessEntry>()

  function entryFor(context: HarnessTarget): HarnessEntry {
    const key = entryKey(context)
    let entry = entries.get(key)
    if (!entry) {
      entry = {}
      entries.set(key, entry)
    }
    return entry
  }

  async function publish(context: HarnessTarget, availability: HarnessAvailability) {
    if (typeof context === 'string') return options.onAuthChanged?.(context)
    options.publish({
      type: 'harness:updated',
      workspaceId: context.id,
      availability
    })
  }

  async function probeFresh(ws: HarnessTarget): Promise<HarnessAvailability> {
    const entry = entryFor(ws)
    if (!entry.probe) {
      entry.probe = Promise.resolve()
        .then(() => options.probe(ws))
        .catch(err => failedProbeAvailability(ws, err))
        .finally(() => {
          entry.probe = undefined
        })
    }
    const value = await entry.probe
    entry.cached = { value, checkedAt: Date.now() }
    return value
  }

  async function getAvailability(ws: HarnessTarget): Promise<HarnessAvailability> {
    const entry = entryFor(ws)
    if (entry.cached && Date.now() - entry.cached.checkedAt < ttlMs) {
      return entry.cached.value
    }
    return probeFresh(ws)
  }

  // Bypass the TTL and push the result even if it's unchanged. For callers
  // that suspect the cached snapshot is stale for a reason other than an env
  // change (e.g. a send just failed, which can mean the provider was signed
  // out from outside moi — a `codex logout` in a terminal, say).
  async function refresh(ws: HarnessTarget): Promise<HarnessAvailability> {
    const value = await probeFresh(ws)
    await publish(ws, value)
    return value
  }

  function getLogin(context: WorkspaceType): HarnessLoginState | undefined {
    return entries.get(entryKey(context))?.login?.state
  }

  // Re-probe until the login lands or the deadline passes. One loop per
  // ceremony; a replaced or completed ceremony stops its loop.
  function watch(
    type: WorkspaceType,
    login: LoginCeremony,
    initialAvailability: HarnessAvailability
  ) {
    const deadline = Date.now() + deadlineMs
    let stopped = false
    let publishedAvailability = initialAvailability
    let timer: ReturnType<typeof setTimeout>
    login.stop = () => {
      stopped = true
      clearTimeout(timer)
    }
    const tick = async () => {
      const value = await probeFresh(type)
      if (stopped) return
      const entry = entryFor(type)
      if (value.status === 'available' && (!login.attempt?.completed || login.completed)) {
        entry.login = undefined
        await publish(type, value)
        return
      }
      if (Date.now() >= deadline) {
        // Keep the failed state so the connection panel can show it; the next
        // startLogin replaces it.
        stopLogin(login)
        login.state = { state: 'failed', reason: 'Sign-in did not complete. Try again' }
        await publish(type, value)
        return
      }
      if (!sameAvailability(value, publishedAvailability)) {
        publishedAvailability = value
        await publish(type, value)
      }
      timer = setTimeout(tick, pollMs)
      timer.unref?.()
    }
    // Unref'd so a pending ceremony never keeps the process alive on its own.
    timer = setTimeout(tick, pollMs)
    timer.unref?.()
  }

  async function startLogin(type: WorkspaceType): Promise<HarnessLogin> {
    const entry = entryFor(type)
    // Concurrent starts share the provider call; active attempts reuse their instructions.
    const current = entry.login
    if (current?.starting) return current.starting
    if (current?.state.state === 'pending') {
      const { state: _state, ...instructions } = current.state
      return instructions
    }

    if (current) stopLogin(current)
    const starting = options.startLogin(type).then(attempt => {
      const { completed, cancel: _cancel, submitCode: _submitCode, ...instructions } = attempt
      login.attempt = attempt
      if (entry.login !== login) {
        stopLogin(login)
      }
      void completed?.then(
        () => {
          login.completed = true
        },
        () => {
          if (entry.login !== login) return
          stopLogin(login)
          login.state = { state: 'failed', reason: 'Sign-in failed or expired. Try again' }
          void refresh(type)
        }
      )
      return instructions
    })
    const login: LoginCeremony = { state: { state: 'starting' }, starting, stop: () => {} }
    entry.login = login
    try {
      const result = await starting
      if (entry.login !== login) return result
      login.starting = undefined
      if (login.state.state === 'starting') login.state = { state: 'pending', ...result }
      const availability = entry.cached?.value ?? {
        status: 'login-required',
        reason: 'Waiting for sign-in'
      }
      await publish(type, availability)
      if (login.state.state === 'pending') watch(type, login, availability)
      return result
    } catch (err) {
      if (entry.login === login) entry.login = undefined
      throw err
    }
  }

  // Drop the cached snapshot so the next read re-probes (e.g. after an env
  // change swaps credentials).
  function invalidate(context: HarnessTarget) {
    const entry = entries.get(entryKey(context))
    if (!entry) return
    entry.cached = undefined
    if (entry.login) stopLogin(entry.login)
    entry.login = undefined
  }

  function stopLogin(login: LoginCeremony) {
    login.stop()
    void Promise.resolve()
      .then(() => login.attempt?.cancel?.())
      .catch(() => {})
  }

  function activeLogin(type: WorkspaceType, id: string) {
    const login = entryFor(type).login
    if (!login || login.state.state !== 'pending' || login.state.id !== id) {
      throw new Error('This sign-in attempt has ended. Start again')
    }
    return login
  }

  async function submitCode(type: WorkspaceType, id: string, code: string) {
    const login = activeLogin(type, id)
    if (!login.attempt?.submitCode) throw new Error('This sign-in does not accept a code')
    await login.attempt.submitCode(code)
  }

  function shutdown() {
    for (const entry of entries.values()) {
      if (entry.login) stopLogin(entry.login)
      entry.login = undefined
    }
  }

  return {
    getAvailability,
    refresh,
    getLogin,
    startLogin,
    submitCode,
    invalidate,
    shutdown
  }
}

export type HarnessStore = ReturnType<typeof createHarnessStore>

export const harnessStore = createHarnessStore({
  probe: async context => {
    const harness = harnessFor(context)
    if (typeof context !== 'string') {
      return (await harness.availability?.(context)) ?? { status: 'available' }
    }
    if (!harness.authStatus)
      return { status: 'unavailable', reason: 'This agent requires terminal sign-in' }
    return harness.authStatus()
  },
  startLogin: type => {
    const start = harnessFor(type).startLogin
    if (!start) throw new Error('This agent requires terminal sign-in')
    return start()
  },
  publish: publishEvent,
  onAuthChanged: async type => {
    // Shared credentials still need an independent check in each workspace.
    try {
      const workspaces = await listWorkspaces()
      await Promise.all(
        workspaces.filter(ws => harnessFor(ws).id === type).map(ws => harnessStore.refresh(ws))
      )
    } catch (error) {
      console.error('[harness-auth] could not refresh workspaces after login', error)
    }
  }
})
