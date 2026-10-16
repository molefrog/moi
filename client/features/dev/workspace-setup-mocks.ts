import type {
  AppEnvironment,
  HarnessAvailability,
  HarnessLoginState,
  WorkspaceAgent,
  WorkspaceEnvView
} from '@/lib/types'
import { createDefaultWorkspaceLayout } from '@/lib/workspace-layout'
import type { EnvPatch } from '@/client/features/settings/api'
import type { LoginHarness } from '@/client/features/harness/harness-connection'

export const PREVIEW_WORKSPACE_ID = 'setup-preview'
export const MOCK_CODE_SIGN_IN_URL = 'https://example.invalid/moi-code-sign-in'
export const MOCK_SIGN_IN_URL = 'https://example.invalid/moi-sign-in'
export const SETUP_SCENARIOS = [
  'welcome',
  'login',
  'missing-agent',
  'missing-folder',
  'loading'
] as const
export type SetupScenario = (typeof SETUP_SCENARIOS)[number]

export function createSetupMocks(
  environment: AppEnvironment,
  harness: LoginHarness,
  scenario: SetupScenario
) {
  let availability: HarnessAvailability =
    scenario === 'missing-agent'
      ? {
          status: 'unavailable',
          code: 'not-installed',
          reason: 'This agent is not installed. Install it, then try again.'
        }
      : { status: 'login-required', reason: 'Sign in to continue.' }
  let login: HarnessLoginState | undefined
  let env: WorkspaceEnvView = {
    vars: [],
    files: [],
    inheritDotenv: true,
    backend: 'keychain',
    required: []
  }
  const missingFolder = scenario === 'missing-folder'

  function complete() {
    availability = { status: 'available' }
    login = undefined
  }

  async function request(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      'http://preview.invalid'
    )
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
    const path = url.pathname
    if (url.origin !== 'http://preview.invalid')
      throw new Error('Sandbox blocked an external request')
    if (path === '/api/config' && method === 'GET') {
      return Response.json({
        environment,
        demo: false,
        experimental: { collab: false },
        demoInstallUrl: ''
      })
    }
    if (path === `/api/workspaces/${PREVIEW_WORKSPACE_ID}` && method === 'GET') {
      return Response.json({
        ...createDefaultWorkspaceLayout(),
        name: 'My workspace',
        cwd: '/mock/workspace',
        provider: harness
      })
    }
    if (path === `/api/workspaces/${PREVIEW_WORKSPACE_ID}/mcp` && method === 'GET')
      return Response.json([])
    if (path === `/api/workspaces/${PREVIEW_WORKSPACE_ID}/env`) {
      if (method === 'PUT') {
        const patch = JSON.parse(String(init?.body)) as EnvPatch
        const keys = new Set(env.vars.map(variable => variable.key))
        for (const key of patch.remove ?? []) keys.delete(key)
        for (const key of Object.keys(patch.set ?? {})) keys.add(key)
        env = {
          ...env,
          inheritDotenv: patch.inheritDotenv ?? env.inheritDotenv,
          vars: [...keys].map(key => ({ key, source: 'custom' }))
        }
      }
      if (method === 'GET' || method === 'PUT') return Response.json(env)
    }
    if (path === `/api/workspaces/${PREVIEW_WORKSPACE_ID}` && method === 'DELETE')
      return new Response(null, { status: 204 })
    if (path === `/api/workspaces/${PREVIEW_WORKSPACE_ID}/agent` && method === 'GET') {
      return Response.json({
        provider: harness,
        availability,
        models: [],
        supportsStreaming: true,
        supportsArchiving: true,
        ...(missingFolder ? { missingWorkspacePath: '/mock/missing-workspace' } : {})
      } satisfies WorkspaceAgent)
    }
    const authPath = `/api/harnesses/${harness}/auth`
    if (path === authPath && method === 'GET') return Response.json({ availability, login })
    if (path === `${authPath}/login` && method === 'POST') {
      login = { state: 'starting' }
      await new Promise(resolve => setTimeout(resolve, 500))
      login = {
        state: 'pending',
        id: 'mock-login',
        url:
          harness === 'claude-code' && environment === 'cloud'
            ? MOCK_CODE_SIGN_IN_URL
            : MOCK_SIGN_IN_URL,
        ...(harness === 'claude-code'
          ? { acceptsCode: true, codeUrl: MOCK_CODE_SIGN_IN_URL }
          : environment === 'cloud'
            ? { userCode: 'MOCK-1234' }
            : {})
      }
      return Response.json(login)
    }
    if (path === `${authPath}/login/mock-login/code` && method === 'POST') {
      const body = JSON.parse(String(init?.body)) as { code: string }
      if (body.code !== 'MOCK-AUTH-CODE')
        return new Response('Use MOCK-AUTH-CODE in this sandbox.', { status: 400 })
      complete()
      return new Response(null, { status: 204 })
    }
    throw new Error(`Sandbox blocked an unexpected request: ${method} ${path}`)
  }

  return { request, complete }
}
