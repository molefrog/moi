import { Hono } from 'hono'

import type { WorkspaceType } from '@/lib/types'

import { loginShellPath } from '../harness/shell-path'
import { installHarness } from '../harness/install'
import { harnessStore } from '../harness/auth'
import { allHarnesses, harnessFor, isHarnessType } from '../harness/registry'

export const harnesses = new Hono<{ Variables: { harnessType: WorkspaceType } }>()

harnesses.get('/status', async c => {
  c.header('Cache-Control', 'no-store')
  const fresh = c.req.query('refresh') === 'true'
  if (fresh) await loginShellPath({ refresh: true })
  const statuses = await Promise.all(
    allHarnesses().map(async ({ id }) => [
      id,
      {
        availability: await harnessStore.getAvailability(id, fresh),
        login: harnessStore.getLogin(id)
      }
    ])
  )
  return c.json(Object.fromEntries(statuses))
})

harnesses.use('/:type/*', async (c, next) => {
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

harnesses.post('/:type/auth/install', async c => {
  const origin = c.req.header('Origin')
  if (origin && origin !== new URL(c.req.url).origin) return c.text('Invalid origin', 403)
  try {
    const type = c.get('harnessType')
    await installHarness(type)
    await harnessStore.refresh(type)
    return c.json({ ok: true })
  } catch (error) {
    return c.text(error instanceof Error ? error.message : 'Could not install agent', 400)
  }
})

harnesses.post('/:type/auth/login', async c => {
  try {
    return c.json(await harnessStore.startLogin(c.get('harnessType')))
  } catch (error) {
    return c.text(error instanceof Error ? error.message : 'Could not start sign-in', 500)
  }
})

harnesses.post('/:type/auth/login/:id/code', async c => {
  try {
    const body: unknown = await c.req.json()
    if (
      !body ||
      typeof body !== 'object' ||
      !('code' in body) ||
      typeof body.code !== 'string' ||
      body.code.length > 4096 ||
      !body.code.trim()
    ) {
      return c.text('Enter the authorization code', 400)
    }
    await harnessStore.submitCode(c.get('harnessType'), c.req.param('id'), body.code)
    return c.json({ ok: true })
  } catch (error) {
    return c.text(error instanceof Error ? error.message : 'Could not submit code', 400)
  }
})
