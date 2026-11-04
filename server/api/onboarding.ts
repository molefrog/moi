import { Hono } from 'hono'
import { z } from 'zod'
import { getAppConfig } from '../app-config'
import { getAppSettings } from '../app-settings'
import { cancelIdeas, createFromIdea, discoverIdeas } from '../onboarding/jobs'

const discoverySchema = z.object({
  harness: z.enum(['claude-code', 'codex']),
  runId: z.string().uuid()
})
const buildSchema = discoverySchema.extend({
  ideaId: z.string().uuid(),
  operationId: z.string().uuid(),
  retry: z.boolean().optional()
})
export const onboarding = new Hono()
onboarding.use('*', async (c, next) => {
  if (getAppConfig().demo || !getAppSettings().showOnboarding)
    return c.json({ error: 'Onboarding is not enabled' }, 403)
  c.header('Cache-Control', 'no-store')
  await next()
})
onboarding.post('/discover', async c => {
  const parsed = discoverySchema.safeParse(await c.req.json().catch(() => undefined))
  if (!parsed.success) return c.json({ error: 'Invalid discovery request' }, 400)
  return c.json(await discoverIdeas(parsed.data))
})
onboarding.post('/cancel', async c => {
  const parsed = z
    .object({ runId: z.string().uuid() })
    .safeParse(await c.req.json().catch(() => undefined))
  if (!parsed.success) return c.json({ error: 'Invalid discovery request' }, 400)
  await cancelIdeas(parsed.data.runId)
  return c.json({ status: 'done' })
})
onboarding.post('/create', async c => {
  const parsed = buildSchema.safeParse(await c.req.json().catch(() => undefined))
  if (!parsed.success) return c.json({ error: 'Invalid workspace request' }, 400)
  const { harness, runId, ideaId, operationId, retry } = parsed.data
  // Use the validated server result, never a browser-supplied workspace plan.
  const discovery = await discoverIdeas({ harness, runId })
  const idea = discovery.ideas?.find(idea => idea.id === ideaId)
  if (discovery.status !== 'done' || !idea)
    return c.json({ error: 'Choose an available idea' }, 409)
  return c.json(await createFromIdea({ harness, operationId, idea }, retry))
})
