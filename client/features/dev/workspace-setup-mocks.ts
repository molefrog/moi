import type {
  AppEnvironment,
  HarnessAvailability,
  HarnessLoginState,
  WorkspaceAgent
} from '@/lib/types'
import type { LoginHarness } from '@/client/features/harness/api'

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
    if (path === `/api/workspaces/${PREVIEW_WORKSPACE_ID}` && method === 'DELETE')
      return new Response(null, { status: 204 })
    if (path === `/api/workspaces/${PREVIEW_WORKSPACE_ID}/agent` && method === 'GET') {
      return Response.json({
        provider: harness,
        availability,
        models: [],
        supportsStreaming: true,
        supportsArchiving: true,
        workspaceFolderMissing: missingFolder
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
          ? { codeUrl: MOCK_CODE_SIGN_IN_URL }
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
