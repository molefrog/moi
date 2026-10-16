import { expect, test } from 'bun:test'
import {
  createSetupMocks,
  MOCK_CODE_SIGN_IN_URL,
  MOCK_SIGN_IN_URL,
  PREVIEW_WORKSPACE_ID
} from './workspace-setup-mocks'

for (const environment of ['local', 'cloud'] as const) {
  for (const harness of ['claude-code', 'codex'] as const) {
    test(`${environment} ${harness} uses mock instructions and completes without credentials`, async () => {
      const mocks = createSetupMocks(environment, harness, 'login')
      const base = `/api/harnesses/${harness}/auth`
      const starting = mocks.request(`${base}/login`, { method: 'POST' })
      expect((await (await mocks.request(base)).json()).login).toEqual({ state: 'starting' })
      const login = await (await starting).json()
      expect(login.url).toBe(
        harness === 'claude-code' && environment === 'cloud'
          ? MOCK_CODE_SIGN_IN_URL
          : MOCK_SIGN_IN_URL
      )
      expect(login.codeUrl).toBe(harness === 'claude-code' ? MOCK_CODE_SIGN_IN_URL : undefined)
      expect(login.acceptsCode).toBe(harness === 'claude-code' ? true : undefined)
      expect(login.userCode).toBe(
        harness === 'codex' && environment === 'cloud' ? 'MOCK-1234' : undefined
      )
      if (harness === 'claude-code') {
        expect(
          (
            await mocks.request(`${base}/login/mock-login/code`, {
              method: 'POST',
              body: JSON.stringify({ code: 'wrong' })
            })
          ).status
        ).toBe(400)
        await mocks.request(`${base}/login/mock-login/code`, {
          method: 'POST',
          body: JSON.stringify({ code: 'MOCK-AUTH-CODE' })
        })
      } else mocks.complete()
      expect((await (await mocks.request(base)).json()).availability.status).toBe('available')
    })
  }
}

test('unexpected requests and real workspace IDs cannot fall through to a server', async () => {
  const mocks = createSetupMocks('local', 'codex', 'welcome')
  for (const path of [
    '/api/workspaces/real-id',
    '/api/unknown',
    'https://auth.openai.com/authorize'
  ]) {
    await expect(mocks.request(path, { method: 'DELETE' })).rejects.toThrow('Sandbox blocked')
  }
  await expect(mocks.request('/api/workspaces/create', { method: 'POST' })).rejects.toThrow(
    'Sandbox blocked'
  )
  expect(
    (await mocks.request(`/api/workspaces/${PREVIEW_WORKSPACE_ID}`, { method: 'DELETE' })).status
  ).toBe(204)
})

test('missing installation and folder scenarios return the real recovery shapes', async () => {
  for (const scenario of ['missing-agent', 'missing-folder'] as const) {
    const mocks = createSetupMocks('local', 'codex', scenario)
    const data = await (
      await mocks.request(`/api/workspaces/${PREVIEW_WORKSPACE_ID}/agent?refresh=true`)
    ).json()
    if (scenario === 'missing-folder') expect(data.missingWorkspacePath).toBeDefined()
    else expect(data.availability).toMatchObject({ status: 'unavailable', code: 'not-installed' })
  }
})

test('settings read and update only the mock workspace', async () => {
  const mocks = createSetupMocks('local', 'codex', 'login')
  const path = `/api/workspaces/${PREVIEW_WORKSPACE_ID}`
  expect(await (await mocks.request(path)).json()).toMatchObject({
    name: 'My workspace',
    cwd: '/mock/workspace',
    provider: 'codex'
  })
  expect(await (await mocks.request(`${path}/mcp`)).json()).toEqual([])
  const patch = (body: unknown) =>
    mocks.request(`${path}/env`, {
      method: 'PUT',
      body: JSON.stringify(body)
    })
  const saved = await (
    await patch({ set: { MOCK_KEY: 'fake-value' }, inheritDotenv: false })
  ).json()
  expect(saved.vars).toEqual([{ key: 'MOCK_KEY', source: 'custom' }])
  expect(saved.inheritDotenv).toBe(false)
  expect(JSON.stringify(saved)).not.toContain('fake-value')
  expect(await (await mocks.request(`${path}/env`)).json()).toEqual(saved)
  expect((await (await patch({ remove: ['MOCK_KEY'] })).json()).vars).toEqual([])
  const fresh = createSetupMocks('local', 'codex', 'login')
  expect((await (await fresh.request(`${path}/env`)).json()).inheritDotenv).toBe(true)
  await expect(
    mocks.request('/api/workspaces/real-id/env', {
      method: 'PUT',
      body: JSON.stringify({ set: { MOCK_KEY: 'fake-value' } })
    })
  ).rejects.toThrow('Sandbox blocked')
})
