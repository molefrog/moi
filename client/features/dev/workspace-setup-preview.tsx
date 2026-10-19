import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Router, useLocation } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import { loadAppConfig } from '@/client/api/app-config'
import { Button } from '@/client/components/ui/button'
import { Input } from '@/client/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle
} from '@/client/components/ui/dialog'
import { TooltipProvider } from '@/client/components/ui/tooltip'
import { Toaster } from '@/client/components/ui/toast'
import { WorkspaceSetupPanel } from '@/client/features/workspace/setup/workspace-setup-panel'
import { useWorkspaceSetup } from '@/client/features/workspace/setup/workspace-setup'
import { WorkspaceWelcomeState } from '@/client/features/workspace/setup/workspace-welcome-state'
import { WorkspaceLoadingState } from '@/client/features/workspace/setup/workspace-recovery-states'
import type { AppEnvironment } from '@/lib/types'
import { workspaceTypeLabel } from '@/client/features/workspace/workspace-presentation'
import { useHarnessAuth, type LoginHarness } from '@/client/features/harness/api'
import {
  createSetupMocks,
  MOCK_SIGN_IN_URL,
  MOCK_CODE_SIGN_IN_URL,
  PREVIEW_WORKSPACE_ID,
  SETUP_SCENARIOS
} from './workspace-setup-mocks'
import type { SetupScenario } from './workspace-setup-mocks'

const scenarioLabels: Record<SetupScenario, string> = {
  welcome: 'Welcome',
  login: 'Login',
  'missing-agent': 'Agent missing',
  'missing-folder': 'Folder missing',
  loading: 'Loading'
}

type SetupPreviewProps = {
  mocks: ReturnType<typeof createSetupMocks>
  client: QueryClient
  environment: AppEnvironment
  harness: LoginHarness
  scenario: SetupScenario
}

function SetupPreview({ mocks, client, environment, harness, scenario }: SetupPreviewProps) {
  const [provider, setProvider] = useState<'browser' | 'code' | 'closed'>()
  const [deviceCode, setDeviceCode] = useState('')
  const auth = useHarnessAuth(harness)
  const pendingId = auth.data?.login?.state === 'pending' ? auth.data.login.id : undefined
  // Both local harnesses open the browser automatically.
  const providerPage = provider ?? (environment === 'local' && pendingId ? 'browser' : 'closed')

  function restart(next: Record<string, string> = {}) {
    const params = new URLSearchParams({ environment, harness, scenario, ...next })
    window.location.assign(`?${params.toString()}`)
  }
  function update(action: () => void) {
    action()
    void client.invalidateQueries()
  }

  return (
    <div
      className="flex h-dvh flex-col bg-background text-foreground"
      onClickCapture={event => {
        const link = (event.target as Element).closest('a')
        if (link?.href === MOCK_SIGN_IN_URL || link?.href === MOCK_CODE_SIGN_IN_URL) {
          event.preventDefault()
          setProvider(link.href === MOCK_CODE_SIGN_IN_URL ? 'code' : 'browser')
        }
      }}
    >
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border p-3 text-sm">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Environment">
          {(['local', 'cloud'] as const).map(value => (
            <Button
              key={value}
              size="sm"
              variant={environment === value ? 'default' : 'secondary'}
              onClick={() => restart({ environment: value })}
            >
              {value === 'local' ? 'Local' : 'Cloud'}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Agent">
          {(['claude-code', 'codex'] as const).map(value => (
            <Button
              key={value}
              size="sm"
              variant={harness === value ? 'default' : 'secondary'}
              onClick={() => restart({ harness: value })}
            >
              {workspaceTypeLabel[value]}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Scenario">
          {SETUP_SCENARIOS.map(value => (
            <Button
              key={value}
              size="sm"
              variant={scenario === value ? 'default' : 'secondary'}
              onClick={() => restart({ scenario: value })}
            >
              {scenarioLabels[value]}
            </Button>
          ))}
        </div>
      </header>
      <main className="flex min-h-0 flex-1 overflow-y-auto">
        {scenario === 'welcome' ? (
          <WorkspaceSetupPanel>
            <WorkspaceWelcomeState name="My workspace" workspaceType={harness} />
          </WorkspaceSetupPanel>
        ) : scenario === 'loading' ? (
          <WorkspaceSetupPanel>
            <WorkspaceLoadingState />
          </WorkspaceSetupPanel>
        ) : (
          <SetupScreen />
        )}
      </main>
      <Dialog
        open={providerPage !== 'closed'}
        onOpenChange={open => !open && setProvider('closed')}
      >
        <DialogContent>
          <DialogTitle>Mock sign-in page</DialogTitle>
          <DialogDescription>
            This simulates the agent’s browser sign-in. No credentials are needed.
          </DialogDescription>
          {providerPage === 'code' ? (
            <>
              <p className="text-sm">
                Copy this authorization code, close this dialog, and submit it in the login screen:
              </p>
              <code>MOCK-AUTH-CODE</code>
              <Button onClick={() => setProvider('closed')}>Back to Moi</Button>
            </>
          ) : (
            <>
              {environment === 'cloud' && (
                <Input
                  aria-label="Device code"
                  placeholder="Paste MOCK-1234"
                  value={deviceCode}
                  onChange={event => setDeviceCode(event.target.value)}
                />
              )}
              <Button
                disabled={environment === 'cloud' && deviceCode !== 'MOCK-1234'}
                onClick={() => {
                  update(mocks.complete)
                  setProvider('closed')
                }}
              >
                Authorize
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SetupScreen() {
  const [path] = useLocation()
  const { content, ready } = useWorkspaceSetup(PREVIEW_WORKSPACE_ID)
  if (ready) return null
  return path === '/' ? (
    <div
      role="status"
      className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground"
    >
      Workspace removed
    </div>
  ) : (
    <WorkspaceSetupPanel>{content}</WorkspaceSetupPanel>
  )
}

export async function mountSetupPreview(element: HTMLElement) {
  const params = new URLSearchParams(location.search)
  const environment = params.get('environment') === 'cloud' ? 'cloud' : 'local'
  const harness = params.get('harness') === 'codex' ? 'codex' : 'claude-code'
  const scenario = SETUP_SCENARIOS.find(value => value === params.get('scenario')) ?? 'welcome'
  const mocks = createSetupMocks(environment, harness, scenario)
  // Scoped to this separate document. No fallback to the real fetch or socket.
  window.fetch = Object.assign(mocks.request, { preconnect: fetch.preconnect })
  Object.defineProperty(window, 'WebSocket', {
    value: class extends EventTarget {
      static OPEN = 1
      readyState = 0
      send() {}
      close() {}
    }
  })
  await loadAppConfig()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const locationHook = memoryLocation({
    path: `/workspace/${PREVIEW_WORKSPACE_ID}`
  })
  createRoot(element).render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <Router hook={locationHook.hook}>
          <SetupPreview
            mocks={mocks}
            client={client}
            environment={environment}
            harness={harness}
            scenario={scenario}
          />
        </Router>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  )
}
