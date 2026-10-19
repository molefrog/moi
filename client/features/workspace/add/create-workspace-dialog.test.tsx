import { expect, spyOn, test } from 'bun:test'
import { act, type ComponentProps, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { parseHTML } from 'linkedom'
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as router from 'wouter'

import * as config from '@/client/api/app-config'
import * as dialog from '@/client/components/ui/dialog'
import { workspaceKeys } from '@/client/api/workspace-keys'
import * as api from './api'
import { CreateWorkspaceDialog } from './create-workspace-dialog'
import { WorkspaceDialogContent } from './workspace-dialog-content'

test('create blocks dismissal while submitting and permits it again after failure', async () => {
  const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>')
  const globals = {
    window,
    document,
    HTMLElement: window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true
  }
  const descriptors = new Map(
    Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
  )
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, { configurable: true, value })
  notifyManager.setNotifyFunction(callback => act(callback))
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  })
  const installed = { 'claude-code': true, codex: true, openclaw: false, hermes: false }
  client.setQueryData(workspaceKeys.creationInfo, { installed })
  const configSpy = spyOn(config, 'useAppConfig').mockReturnValue({
    environment: 'local',
    demo: false,
    experimental: { collab: false },
    demoInstallUrl: ''
  })
  const locationSpy = spyOn(router, 'useLocation').mockReturnValue(['/', () => {}])
  const response = Promise.withResolvers<Response>()
  const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(
      async (_input: RequestInfo | URL, init?: RequestInit) =>
        init?.method === 'POST' ? response.promise : Response.json({ installed }),
      { preconnect: fetch.preconnect }
    )
  )
  // Observe the dialog contract without mounting the portal/focus-management library.
  let dialogProps!: ComponentProps<typeof dialog.Dialog>
  const dialogSpy = spyOn(dialog, 'Dialog').mockImplementation(props => {
    dialogProps = props
    return <></>
  })
  let mutation!: ReturnType<typeof api.useCreateWorkspace>
  const useCreateWorkspace = api.useCreateWorkspace
  const mutationSpy = spyOn(api, 'useCreateWorkspace').mockImplementation(() => {
    mutation = useCreateWorkspace()
    return mutation
  })
  const root = createRoot(document.getElementById('root')!)
  function requestOpen(open: boolean) {
    // The app handler uses only the requested open state.
    dialogProps.onOpenChange?.(
      open,
      {} as Parameters<NonNullable<typeof dialogProps.onOpenChange>>[1]
    )
  }
  function showsCloseButton() {
    const children = dialogProps.children as ReactElement<
      ComponentProps<typeof WorkspaceDialogContent>
    >[]
    return children.find(child => child.type === WorkspaceDialogContent)?.props.showCloseButton
  }
  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <CreateWorkspaceDialog trigger={<button>Create</button>} />
        </QueryClientProvider>
      )
    )
    await act(async () => requestOpen(true))
    expect(dialogProps.open).toBe(true)
    expect(showsCloseButton()).toBe(true)

    let submission!: Promise<unknown>
    await act(async () => {
      submission = mutation.mutateAsync({ name: 'test', type: 'claude-code' }).catch(error => error)
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    expect(mutation.isPending).toBe(true)
    expect(showsCloseButton()).toBe(false)
    await act(async () => requestOpen(false))
    expect(dialogProps.open).toBe(true)

    await act(async () => {
      response.resolve(new Response('Creation failed', { status: 500 }))
      await submission
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    expect(mutation.isPending).toBe(false)
    expect(showsCloseButton()).toBe(true)
    await act(async () => requestOpen(false))
    expect(dialogProps.open).toBe(false)
  } finally {
    await act(async () => root.unmount())
    client.clear()
    mutationSpy.mockRestore()
    dialogSpy.mockRestore()
    fetchSpy.mockRestore()
    locationSpy.mockRestore()
    configSpy.mockRestore()
    notifyManager.setNotifyFunction(callback => callback())
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
})
