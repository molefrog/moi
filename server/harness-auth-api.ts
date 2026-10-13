import { Hono } from 'hono'

import type { WorkspaceType } from '@/lib/types'

import { harnessStore } from './harness-auth'
import { harnessFor, isHarnessType } from './harness/registry'

export const harnessAuthApi = new Hono<{ Variables: { harnessType: WorkspaceType } }>()

harnessAuthApi.use('/:type/auth/*', async (c, next) => {
  const type = c.req.param('type')
  if (!isHarnessType(type)) return c.text('Unknown agent', 404)
  const harness = harnessFor(type)
  if (!harness.startLogin || !harness.authStatus) {
    return c.text('This agent requires terminal sign-in', 409)
  }
  c.set('harnessType', type)
  c.header('Cache-Control', 'no-store')
  await next()
})

harnessAuthApi.get('/:type/auth', async c => {
  const context = c.get('harnessType')
  return c.json({
    availability: await harnessStore.getAvailability(context),
    login: harnessStore.getLogin(context)
  })
})

harnessAuthApi.post('/:type/auth/login', async c => {
  try {
    return c.json(await harnessStore.startLogin(c.get('harnessType')))
  } catch (error) {
    return c.text(error instanceof Error ? error.message : 'Could not start sign-in', 500)
  }
})
