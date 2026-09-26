import type { CollabServerMessage } from '@/lib/collab/types'

import type { ParentMessage, WorkerMessage } from './ipc'
import { CollabService } from './service'

const workspacePath = process.env.MOI_COLLAB_WORKSPACE
const generation = process.env.MOI_COLLAB_GENERATION
if (!workspacePath || !generation || !process.send) throw new Error('Missing collab worker context')

function send(message: WorkerMessage) {
  process.send?.(message)
}

const service = new CollabService((connectionId, message) => {
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
      const response: CollabServerMessage = {
        type: 'error',
        ...errorInfo(error)
      }
      send({ type: 'client', generation, connectionId: message.connectionId, message: response })
    }
    return
  }
})

let shuttingDown = false
function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  service.close()
  process.exit(0)
}
process.on('disconnect', shutdown)
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
send({ type: 'ready', generation })
