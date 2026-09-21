import { join } from 'node:path'

import type { CollabServerMessage } from '@/lib/collab/types'

import type { ParentMessage, WorkerMessage } from './ipc'
import { CollabService } from './service'
import { openCollabStorage } from './storage'

const workspacePath = process.env.MOI_COLLAB_WORKSPACE
const generation = process.env.MOI_COLLAB_GENERATION
if (!workspacePath || !generation || !process.send) throw new Error('Missing collab worker context')

function send(message: WorkerMessage) {
  process.send?.(message)
}

const storage = openCollabStorage(join(workspacePath, '.moi', 'data', 'collab.sqlite'))
const service = new CollabService(storage, (connectionId, message) => {
  send({ type: 'client', generation, connectionId, message })
})

function errorInfo(error: unknown): { code: string; message: string } {
  return {
    code: error instanceof Error && 'code' in error ? String(error.code) : 'invalid_request',
    message: error instanceof Error ? error.message : 'Collab request failed'
  }
}

process.on('message', (message: ParentMessage) => {
  if (message.type === 'shutdown') return shutdown()
  if (message.type === 'leave') return service.leave(message.connectionId)
  if (message.type === 'client') {
    try {
      service.receive(message.connectionId, message.message)
    } catch (error) {
      const source = message.message
      const response: CollabServerMessage = {
        type: 'error',
        ...errorInfo(error),
        ...('operationId' in source ? { operationId: source.operationId } : {}),
        ...('subscriptionId' in source ? { subscriptionId: source.subscriptionId } : {}),
        ...('requestId' in source ? { requestId: source.requestId } : {})
      }
      send({ type: 'client', generation, connectionId: message.connectionId, message: response })
    }
    return
  }
  if (message.type === 'call') {
    try {
      const result = service.run(message.actor, message.command)
      send({ type: 'result', generation, requestId: message.requestId, result })
    } catch (error) {
      send({ type: 'error', generation, requestId: message.requestId, ...errorInfo(error) })
    }
  }
})

const pruneTimer = setInterval(() => storage.pruneReceipts(), 60 * 60_000)
pruneTimer.unref()
let shuttingDown = false
function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  clearInterval(pruneTimer)
  service.close()
  process.exit(0)
}
process.on('disconnect', shutdown)
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
send({ type: 'ready', generation })
