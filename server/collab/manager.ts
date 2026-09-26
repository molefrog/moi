import { realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { COLLAB_MAX_MESSAGE_BYTES, isCollabClientMessage } from '@/lib/collab/protocol'
import type { CollabServerMessage } from '@/lib/collab/types'

import { isCollabEnabled } from './config'
import type { ParentMessage, WorkerMessage } from './ipc'

export type CollabSocket = {
  send: (message: string) => number
  close: (code?: number, reason?: string) => void
  getBufferedAmount?: () => number
}

type Binding = {
  socket: CollabSocket
  workspacePaths: Set<string>
  connectionId: string
  closed: boolean
  lastSeen: number
  joined: boolean
  slot?: Slot
  queue: Promise<void>
}

type Slot = {
  workspacePath: string
  workspacePaths: Set<string>
  generation: string
  child: ReturnType<typeof Bun.spawn>
  ready: Promise<void>
  resolveReady: () => void
  rejectReady: (error: Error) => void
  readyTimer: ReturnType<typeof setTimeout>
  stopping: boolean
  clients: Map<string, Binding>
  idleTimer?: ReturnType<typeof setTimeout>
}

type ManagerOptions = {
  enabled?: (workspacePath: string) => Promise<boolean>
  workerPath?: string
  startupTimeoutMs?: number
  idleTimeoutMs?: number
  livenessTimeoutMs?: number
}

export class CollabRuntimeError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message)
  }
}

// One owner map per moi server. No LRU: active workspaces cannot be evicted.
export class CollabManager {
  private slots = new Map<string, Slot>()
  private bindings = new Map<CollabSocket, Binding>()
  private failures = new Map<string, { count: number; retryAfter: number }>()
  private livenessTimer: ReturnType<typeof setInterval> | null = null
  private closed = false

  constructor(private options: ManagerOptions = {}) {}

  private emit(binding: Binding, message: CollabServerMessage) {
    if (binding.closed) return
    const buffered = binding.socket.getBufferedAmount?.() ?? 0
    if (buffered > 1024 * 1024) {
      if (message.type === 'participants') return
      this.disconnect(binding, 'Collab updates need a fresh connection')
      return
    }
    try {
      if (binding.socket.send(JSON.stringify(message)) === 0)
        this.disconnect(binding, 'Connection lost')
    } catch {
      this.disconnect(binding, 'Connection lost')
    }
  }

  private send(slot: Slot, message: ParentMessage) {
    if (slot.stopping) throw new CollabRuntimeError('restarting', 'Collab is restarting')
    slot.child.send(message)
  }

  private async getSlot(workspacePath: string, binding: Binding): Promise<Slot> {
    if (this.closed || binding.closed)
      throw new CollabRuntimeError('unavailable', 'Collab connection closed')
    const canonicalPath = await realpath(workspacePath)
    binding.workspacePaths.add(canonicalPath)
    if (binding.closed) throw new CollabRuntimeError('unavailable', 'Collab connection closed')
    if (!(await (this.options.enabled ?? isCollabEnabled)(canonicalPath))) {
      throw new CollabRuntimeError('unavailable', 'Start moi with --experimental-collab')
    }
    if (this.closed || binding.closed)
      throw new CollabRuntimeError('unavailable', 'Collab connection closed')
    const current = this.slots.get(canonicalPath)
    if (current) {
      if (current.stopping) {
        await current.child.exited
        if (this.slots.get(canonicalPath) === current) this.slots.delete(canonicalPath)
        return this.getSlot(canonicalPath, binding)
      }
      if (current.idleTimer) clearTimeout(current.idleTimer)
      current.idleTimer = undefined
      current.workspacePaths.add(resolve(workspacePath))
      return current
    }
    const failure = this.failures.get(canonicalPath)
    if (failure && failure.retryAfter > Date.now()) {
      throw new CollabRuntimeError('restarting', 'Collab is recovering; reconnect shortly')
    }
    const slot = this.spawn(canonicalPath)
    slot.workspacePaths.add(resolve(workspacePath))
    return slot
  }

  private spawn(workspacePath: string): Slot {
    let resolveReady: () => void = () => {}
    let rejectReady: (error: Error) => void = () => {}
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve
      rejectReady = reject
    })
    // Startup failure can precede a caller's await; callers still observe the original rejection.
    void ready.catch(() => {})
    const generation = crypto.randomUUID()
    const slot: Slot = {
      workspacePath,
      workspacePaths: new Set([workspacePath]),
      generation,
      child: undefined as never,
      ready,
      resolveReady,
      rejectReady,
      readyTimer: setTimeout(() => {
        slot.rejectReady(new CollabRuntimeError('startup_timeout', 'Collab did not start in time'))
        this.stopSlot(slot, 'Collab startup timed out')
      }, this.options.startupTimeoutMs ?? 10_000),
      stopping: false,
      clients: new Map()
    }
    try {
      slot.child = Bun.spawn(
        [process.execPath, this.options.workerPath ?? join(import.meta.dir, 'worker.ts')],
        {
          cwd: tmpdir(),
          env: {
            PATH: process.env.PATH,
            MOI_COLLAB_WORKSPACE: workspacePath,
            MOI_COLLAB_GENERATION: generation
          },
          stdout: 'inherit',
          stderr: 'inherit',
          ipc: (raw: unknown) => this.receive(slot, raw as WorkerMessage),
          onExit: () => this.exited(slot)
        }
      )
      this.slots.set(workspacePath, slot)
    } catch (error) {
      clearTimeout(slot.readyTimer)
      rejectReady(error instanceof Error ? error : new Error('Collab could not start'))
      throw error
    }
    return slot
  }

  private receive(slot: Slot, message: WorkerMessage) {
    if (slot.stopping || message.generation !== slot.generation) return
    if (message.type === 'ready') {
      clearTimeout(slot.readyTimer)
      slot.resolveReady()
      return
    }
    if (message.type === 'client') {
      const binding = slot.clients.get(message.connectionId)
      if (binding) this.emit(binding, message.message)
      return
    }
  }

  private exited(slot: Slot) {
    const expected = slot.stopping
    slot.stopping = true
    clearTimeout(slot.readyTimer)
    if (slot.idleTimer) clearTimeout(slot.idleTimer)
    const error = new CollabRuntimeError(
      'worker_exited',
      'Collab restarted; reconnect to restore presence'
    )
    slot.rejectReady(error)
    for (const binding of [...slot.clients.values()]) this.disconnect(binding, error.message)
    if (this.slots.get(slot.workspacePath) === slot) this.slots.delete(slot.workspacePath)
    if (!expected) {
      const count = (this.failures.get(slot.workspacePath)?.count ?? 0) + 1
      this.failures.set(slot.workspacePath, {
        count,
        retryAfter: Date.now() + Math.min(250 * 2 ** Math.min(count - 1, 7), 30_000)
      })
    }
  }

  private scheduleIdle(slot: Slot) {
    if (slot.stopping || slot.clients.size || slot.idleTimer) return
    slot.idleTimer = setTimeout(
      () => this.stopSlot(slot, 'Collab workspace is idle'),
      this.options.idleTimeoutMs ?? 60_000
    )
    slot.idleTimer.unref()
  }

  private stopSlot(slot: Slot, reason: string) {
    if (slot.stopping) return
    slot.stopping = true
    clearTimeout(slot.readyTimer)
    slot.rejectReady(new CollabRuntimeError('restarting', reason))
    for (const binding of [...slot.clients.values()]) this.disconnect(binding, reason)
    try {
      slot.child.send({ type: 'shutdown' } satisfies ParentMessage)
    } catch {}
    const deadline = setTimeout(() => slot.child.kill('SIGKILL'), 2000)
    deadline.unref()
    void slot.child.exited.finally(() => clearTimeout(deadline))
  }

  private disconnect(binding: Binding, reason: string) {
    if (binding.closed) return
    this.close(binding.socket)
    binding.socket.close(1012, reason.slice(0, 120))
  }

  open(socket: CollabSocket, workspacePath: string) {
    const binding: Binding = {
      socket,
      workspacePaths: new Set([resolve(workspacePath)]),
      connectionId: crypto.randomUUID(),
      closed: false,
      lastSeen: Date.now(),
      joined: false,
      queue: Promise.resolve()
    }
    this.bindings.set(socket, binding)
    binding.queue = this.getSlot(workspacePath, binding)
      .then(async slot => {
        if (binding.closed) {
          this.scheduleIdle(slot)
          return
        }
        binding.slot = slot
        slot.clients.set(binding.connectionId, binding)
        await slot.ready
      })
      .catch(error => {
        this.emit(binding, {
          type: 'error',
          code: 'unavailable',
          message: error instanceof Error ? error.message : 'Collab unavailable'
        })
        this.disconnect(binding, 'Collab unavailable')
      })
    this.livenessTimer ??= setInterval(() => {
      const now = Date.now()
      for (const client of this.bindings.values()) {
        const timeout = client.joined ? (this.options.livenessTimeoutMs ?? 60_000) : 15_000
        if (now - client.lastSeen > timeout) this.disconnect(client, 'Collab connection timed out')
      }
    }, 5000)
    this.livenessTimer.unref()
  }

  message(socket: CollabSocket, raw: string | Uint8Array) {
    const binding = this.bindings.get(socket)
    if (!binding || binding.closed) return
    const size = typeof raw === 'string' ? new TextEncoder().encode(raw).length : raw.byteLength
    if (size > COLLAB_MAX_MESSAGE_BYTES) {
      this.disconnect(binding, 'Collab message is too large')
      return
    }
    let message: unknown
    try {
      message = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw))
    } catch {}
    if (!isCollabClientMessage(message)) {
      this.emit(binding, {
        type: 'error',
        code: 'invalid_message',
        message: 'Invalid collab message'
      })
      return
    }
    binding.lastSeen = Date.now()
    const validated = message
    binding.queue = binding.queue
      .then(() => {
        if (binding.closed || !binding.slot) return
        if (validated.type === 'join') binding.joined = true
        this.send(binding.slot, {
          type: 'client',
          connectionId: binding.connectionId,
          message: validated
        })
      })
      .catch(() => this.disconnect(binding, 'Collab restarted'))
  }

  close(socket: CollabSocket) {
    const binding = this.bindings.get(socket)
    if (!binding) return
    binding.closed = true
    this.bindings.delete(socket)
    if (!this.bindings.size && this.livenessTimer) {
      clearInterval(this.livenessTimer)
      this.livenessTimer = null
    }
    const slot = binding.slot
    if (!slot) return
    slot.clients.delete(binding.connectionId)
    if (!slot.stopping) {
      try {
        this.send(slot, { type: 'leave', connectionId: binding.connectionId })
      } catch {}
    }
    this.scheduleIdle(slot)
  }

  async stopWorkspace(workspacePath: string) {
    // Remember aliases so removing a missing directory or symlink can still stop its room.
    const knownPath = resolve(workspacePath)
    let slot = [...this.slots.values()].find(slot => slot.workspacePaths.has(knownPath))
    const disconnectPending = (path: string) => {
      for (const binding of this.bindings.values()) {
        if (binding.workspacePaths.has(path)) {
          this.disconnect(binding, 'Collab stopped for this workspace')
        }
      }
    }
    disconnectPending(knownPath)
    if (slot) disconnectPending(slot.workspacePath)
    if (!slot) {
      try {
        const canonicalPath = await realpath(workspacePath)
        disconnectPending(canonicalPath)
        slot = this.slots.get(canonicalPath)
      } catch (error) {
        if (
          error instanceof Error &&
          'code' in error &&
          (error.code === 'ENOENT' || error.code === 'ENOTDIR')
        )
          return
        throw error
      }
    }
    if (!slot) return
    this.stopSlot(slot, 'Collab stopped for this workspace')
    await slot.child.exited
  }

  async shutdown() {
    this.closed = true
    if (this.livenessTimer) clearInterval(this.livenessTimer)
    this.livenessTimer = null
    const slots = [...this.slots.values()]
    for (const slot of slots) this.stopSlot(slot, 'moi is shutting down')
    await Promise.allSettled(slots.map(slot => slot.child.exited))
  }

  debugSnapshot() {
    return [...this.slots.values()].map(slot => ({
      workspacePath: slot.workspacePath,
      pid: slot.child.pid,
      generation: slot.generation,
      connections: slot.clients.size,
      stopping: slot.stopping
    }))
  }
}

export const collabManager = new CollabManager()
