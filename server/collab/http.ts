import { Hono } from 'hono'

import { isCollabActor, isCollabCommand } from '@/lib/collab/protocol'
import type { WorkspaceEntry } from '@/lib/types'
import { getCollabCapability, isCollabEnabled } from './config'
import { callCollab } from './manager'

export const collabRoutes = new Hono<{ Variables: { ws: WorkspaceEntry } }>()

collabRoutes.get('/', async c => {
  const ws = c.get('ws')
  return c.json(await getCollabCapability(ws.path, ws.type))
})

// Agent/server callers use the same ordered writer as browsers. Identity here
// is attribution supplied by the outer environment, never an access credential.
collabRoutes.post('/command', async c => {
  const ws = c.get('ws')
  if (!isCollabEnabled()) return c.json({ error: 'Start moi with --experimental-collab' }, 404)
  const body: unknown = await c.req.json().catch(() => null)
  if (
    !body ||
    typeof body !== 'object' ||
    !('actor' in body) ||
    !('command' in body) ||
    !isCollabActor(body.actor) ||
    !isCollabCommand(body.command) ||
    body.command.type === 'export'
  ) {
    return c.json({ error: 'Expected actor and a snapshot, mutate, or receipts command' }, 400)
  }
  try {
    return c.json(await callCollab(ws.path, body.actor, body.command))
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Collab request failed' }, 409)
  }
})
