import { readFileSync } from 'fs'
import * as path from 'path'

import type { ChatMessage, ServerMessage } from '@/lib/types'

const WORKSPACE = path.join(import.meta.dir, '..', 'workspace')
const MESSAGES_PATH = path.join(WORKSPACE, 'messages.json')

// --- Persistence ---
type StoredState = {
  sessionId: string | null
  messages: ChatMessage[]
}

function loadState(): StoredState {
  try {
    const text = readFileSync(MESSAGES_PATH, 'utf-8')
    return JSON.parse(text)
  } catch {
    return { sessionId: null, messages: [] }
  }
}

// Load persisted state
const storedState = loadState()

export let sessionId: string | null = storedState.sessionId
export const messages: ChatMessage[] = storedState.messages
export let processing = false
export let abortController: AbortController | null = null
export const clients = new Set<Bun.ServerWebSocket<unknown>>()

export function setSessionId(id: string) {
  sessionId = id
}

export function setProcessing(value: boolean) {
  processing = value
}

export function setAbortController(controller: AbortController | null) {
  abortController = controller
}

export function saveState() {
  const data = JSON.stringify({ sessionId, messages }, null, 2)
  Bun.write(MESSAGES_PATH, data)
}

export function broadcast(msg: ServerMessage) {
  const json = JSON.stringify(msg)
  for (const ws of clients) {
    ws.send(json)
  }
}

export function record(msg: ChatMessage) {
  messages.push(msg)
  saveState()
  broadcast(msg)
}
