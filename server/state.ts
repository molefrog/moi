import type { BroadcastFrame, ServerMessage } from '@/lib/types'

import { tapClientFrame } from './harness/debug'

// The chat socket is app-wide (one per client tab, not per workspace), so a
// single set of all connected chat clients is enough. Each broadcast frame
// carries its `workspaceId`, and the client routes it.
const chatClients = new Set<Bun.ServerWebSocket<unknown>>()

export function addClient(ws: Bun.ServerWebSocket<unknown>) {
  chatClients.add(ws)
}

export function removeClient(ws: Bun.ServerWebSocket<unknown>) {
  chatClients.delete(ws)
}

// Connected chat clients (browser tabs), surfaced by /status.
export function getClientCount(): number {
  return chatClients.size
}

// Stamp `workspaceId` onto the frame and fan it out to every connected chat
// client. (Phase 1: broadcast-all; Phase 2 will scope by topic subscription.)
// Every frame is also tapped into the per-workspace debug ring so the
// /playground/harness page can show exactly what clients received.
export function broadcast(workspaceId: string, frame: BroadcastFrame) {
  tapClientFrame(workspaceId, { ...frame, workspaceId })
  const json = JSON.stringify({ ...frame, workspaceId })
  for (const ws of chatClients) ws.send(json)
}

export function broadcastAll(msg: ServerMessage) {
  const json = JSON.stringify(msg)
  for (const ws of chatClients) ws.send(json)
}

export function sendToClient(ws: Bun.ServerWebSocket<unknown>, msg: ServerMessage) {
  ws.send(JSON.stringify(msg))
}
