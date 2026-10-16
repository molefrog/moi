import { expect, spyOn, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import * as config from '@/client/api/app-config'
import { workspaceKeys } from '@/client/api/workspace-keys'
import { canSubmitComposerAction } from '@/client/components/shared/Composer'
import type { HarnessAvailability, WorkspaceAgent } from '@/lib/types'
import * as skills from './useWorkspaceSkillUpdates'
import { useWorkspaceComposerState } from './useWorkspaceComposerState'

function Fixture() {
  const { agentAvailability, composerBanner } = useWorkspaceComposerState('test', {
    chatError: null,
    onDismissChatError: () => {}
  })
  return (
    <>
      {composerBanner?.content}
      <button disabled={!canSubmitComposerAction(true, false, agentAvailability)}>Send</button>
    </>
  )
}

test.each([
  { status: 'login-required', demo: false, failed: false, message: undefined },
  { status: 'unavailable', demo: false, failed: false, message: undefined },
  {
    status: 'login-required',
    demo: true,
    failed: false,
    message: undefined
  },
  { status: 'available', demo: false, failed: true, message: 'Could not check agent availability' }
] as const)(
  'composer feedback for $status, demo=$demo, failed=$failed',
  ({ status, demo, failed, message }) => {
    const client = new QueryClient()
    const key = workspaceKeys.agent('test')
    const availability: HarnessAvailability =
      status === 'available' ? { status } : { status, reason: 'Agent needs attention' }
    client.setQueryData<WorkspaceAgent>(key, {
      provider: 'codex',
      availability,
      models: [],
      supportsStreaming: true,
      supportsArchiving: true
    })
    if (failed)
      client
        .getQueryCache()
        .find({ queryKey: key })!
        .setState({
          status: 'error',
          error: new Error('Network error')
        })
    const cfg = spyOn(config, 'useAppConfig').mockReturnValue({
      environment: 'local',
      demo,
      experimental: { collab: false },
      demoInstallUrl: ''
    })
    const skillUpdates = spyOn(skills, 'useWorkspaceSkillUpdates').mockReturnValue({
      bannerProps: null
    })
    try {
      const html = renderToStaticMarkup(
        <QueryClientProvider client={client}>
          <Fixture />
        </QueryClientProvider>
      )
      expect(html).toContain('disabled=""')
      expect(html).not.toContain('Log in')
      if (message) {
        expect(html).toContain(message)
        expect(html).toContain('Retry')
      } else {
        expect(html).not.toContain('role="alert"')
      }
    } finally {
      skillUpdates.mockRestore()
      cfg.mockRestore()
      client.clear()
    }
  }
)
