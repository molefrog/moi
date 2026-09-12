import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, test } from 'bun:test'

import { workspaceKeys } from '@/client/api/workspace-keys'
import { Workspace } from '@/client/features/workspace/WorkspaceContext'
import { WorkspaceLayoutContext } from '@/client/features/workspace/WorkspaceLayoutContext'
import type { SessionConfig, WorkspaceAgent } from '@/lib/types'
import { createDefaultWorkspaceLayout } from '@/lib/workspace-layout'
import { ChatComposer } from './ChatComposer'

function renderComposer(sessionId: string | null, config?: SessionConfig) {
  const client = new QueryClient()
  const workspaceId = 'composer-native-settings'
  client.setQueryData<WorkspaceAgent>(workspaceKeys.agent(workspaceId), {
    provider: 'fx',
    availability: { status: 'available' },
    supportsStreaming: true,
    models: [
      { value: 'default', displayName: 'Default', resolvedModel: 'sonnet' },
      { value: 'sonnet', displayName: 'Sonnet' },
      {
        value: 'glm',
        displayName: 'GLM',
        supportsEffort: true,
        supportedEffortLevels: ['auto', 'high'],
        defaultEffort: 'auto'
      }
    ]
  })
  if (sessionId && config)
    client.setQueryData(workspaceKeys.sessionConfig(workspaceId, sessionId), config)
  const html = renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <Workspace id={workspaceId}>
        <WorkspaceLayoutContext
          value={{
            workspaceId,
            layout: {
              ...createDefaultWorkspaceLayout(),
              selectedModel: 'sonnet',
              selectedEffort: 'auto'
            },
            setLayout: () => {},
            name: null,
            icon: null,
            cwd: null,
            provider: 'fx',
            isLoading: false
          }}
        >
          <ChatComposer
            composerRef={{ current: null }}
            onSend={() => {}}
            onStop={() => {}}
            processing={false}
            sessionId={sessionId}
            modelSessionId={sessionId}
            availability={{ status: 'available' }}
            draft={{ id: 'probe', initialValue: 'Continue', onChange: () => {} }}
          />
        </WorkspaceLayoutContext>
      </Workspace>
    </QueryClientProvider>
  )
  client.clear()
  return html
}

describe('composer native session settings', () => {
  test('blocks an existing chat while its settings load and does not show workspace picks', () => {
    const html = renderComposer('native-chat')
    const submit = html.match(/<button\b[^>]*aria-label="Send message"[^>]*>/)?.[0]
    expect(submit).toContain(' disabled=""')
    expect(html).not.toContain('Sonnet')
  })

  test('shows the native model and effort and enables sending once loaded', () => {
    const html = renderComposer('native-chat', { model: 'glm', effort: 'high' })
    const submit = html.match(/<button\b[^>]*aria-label="Send message"[^>]*>/)?.[0]
    expect(submit).not.toContain(' disabled=""')
    expect(html).toContain('GLM')
    expect(html).toContain('High')
    expect(html).not.toContain('Sonnet')
  })

  test('new chats and seeded temporary ids remain sendable', () => {
    for (const html of [renderComposer(null), renderComposer('temporary', { model: 'sonnet' })]) {
      const submit = html.match(/<button\b[^>]*aria-label="Send message"[^>]*>/)?.[0]
      expect(submit).not.toContain(' disabled=""')
      expect(html).toContain('Sonnet')
    }
  })
})
