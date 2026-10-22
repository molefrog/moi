import { expect, spyOn } from 'bun:test'
import { act, useLayoutEffect } from 'react'
import type { ReactNode } from 'react'
import * as layoutEffect from '@base-ui/utils/useIsoLayoutEffect'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'
import { parseHTML } from 'linkedom'
import { QueryClient, QueryClientProvider, notifyManager } from '@tanstack/react-query'
import * as config from '@/client/api/app-config'
import { publishUsers } from '@/client/features/collab/host-state'
import { AccountProvider, useAccount } from './account-provider'
import { sessionQuery, teamQuery } from './api'
import type { CloudSession, CloudTeam } from './api'

const session: CloudSession = {
  user: { id: 'me', name: 'Alex', email: 'alex@example.com', isAnonymous: false }
}
export const ownerTeam: CloudTeam = {
  id: 'team',
  name: 'Team',
  role: 'owner',
  members: [
    {
      id: 'member-me',
      userId: 'me',
      name: 'Alex',
      email: 'alex@example.com',
      role: 'owner',
      me: true
    },
    {
      id: 'member-ada',
      userId: 'ada',
      name: 'Ada',
      email: 'ada@example.com',
      role: 'admin',
      me: false
    }
  ],
  invitations: [
    { id: 'invite-1', email: 'grace@example.com', role: 'admin', expiresAt: '2030-01-01' }
  ]
}
let cleanup = async () => {}
export const cleanupAccount = () => cleanup()

export type AccountFixtureOptions = {
  children?: ReactNode
  role?: string
  anonymous?: boolean
  signedOut?: boolean
  demo?: boolean
  failTeam?: boolean
  environment?: 'local' | 'cloud'
  failSession?: boolean
  loadingSession?: boolean
  pendingMutation?: boolean
  injected?: boolean
  loadingTeam?: boolean
}
export async function mountAccount({
  children = <AccountProbe />,
  role = 'owner',
  anonymous = false,
  signedOut = false,
  demo = false,
  failTeam = false,
  environment = 'cloud',
  failSession = false,
  loadingSession = false,
  pendingMutation = false,
  injected = true,
  loadingTeam = false
}: AccountFixtureOptions = {}) {
  const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>')
  Object.defineProperty(document, 'oninput', { value: null, configurable: true })
  const navigations: string[] = []
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      assign: (href: string) => navigations.push(href),
      replace: (href: string) => navigations.push(href)
    }
  })
  const globals = {
    window,
    document,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    requestAnimationFrame: (callback: FrameRequestCallback) =>
      Number(setTimeout(() => callback(performance.now()), 0)),
    cancelAnimationFrame: (id: number) => clearTimeout(id),
    getComputedStyle: (element: HTMLElement) =>
      new Proxy(element.style, { get: (style, key) => Reflect.get(style, key) ?? '' }),
    Node: window.Node,
    KeyboardEvent: class extends window.Event {},
    FocusEvent: class extends window.Event {},
    MouseEvent: class extends window.Event {},
    IS_REACT_ACT_ENVIRONMENT: true
  }
  const descriptors = new Map(
    Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
  )
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, { configurable: true, value })
  // Base UI was imported before this fixture installed a DOM. Enable its browser effects.
  const layoutEffectSpy = spyOn(layoutEffect, 'useIsoLayoutEffect').mockImplementation(
    useLayoutEffect
  )
  const configSpy = spyOn(config, 'useAppConfig').mockReturnValue({
    environment,
    demo,
    demoInstallUrl: '/',
    experimental: { collab: true }
  })
  let cloudSession: CloudSession = signedOut
    ? null
    : { user: { ...session!.user, isAnonymous: anonymous } }
  let team: CloudTeam = structuredClone({ ...ownerTeam, role })
  const failures = { signOut: false, mutation: false, team: failTeam, session: failSession }
  const mutationRequest = Promise.withResolvers<void>()
  const teamResponse = Promise.withResolvers<Response>()
  const calls: { path: string; body?: Record<string, string> }[] = []
  const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input)
        const body = init?.body
          ? (JSON.parse(String(init.body)) as Record<string, string>)
          : undefined
        calls.push({ path, body })
        if (path.endsWith('/get-session')) {
          if (loadingSession) return new Promise<Response>(() => {})
          return failures.session
            ? Response.json({ error: 'Session unavailable' }, { status: 503 })
            : Response.json(cloudSession)
        }
        if (path.endsWith('/organization')) {
          if (loadingTeam) return teamResponse.promise
          return failures.team
            ? Response.json({ error: 'Team unavailable' }, { status: 503 })
            : Response.json(team)
        }
        if (path.endsWith('/sign-out')) {
          if (failures.signOut)
            return Response.json({ error: 'Try signing out again.' }, { status: 503 })
          cloudSession = null
          return Response.json({ success: true })
        }
        if (pendingMutation) await mutationRequest.promise
        if (failures.mutation)
          return Response.json({ error: 'Only the owner can do that.' }, { status: 403 })
        if (path.endsWith('/profile')) {
          cloudSession = { user: { ...session!.user, name: body!.name! } }
          team.members[0]!.name = body!.name!
          return Response.json({ success: true, name: body!.name })
        }
        if (path.endsWith('/members/remove'))
          team.members = team.members.filter(member => member.id !== body!.memberId)
        if (path.endsWith('/cancel')) team.invitations = []
        if (path.endsWith('/invite'))
          team.invitations.push({
            id: 'invite-new',
            email: body!.email!,
            role: 'admin',
            expiresAt: '2030-01-01'
          })
        return Response.json({ success: true })
      },
      { preconnect: fetch.preconnect }
    )
  )
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  })
  if (!failSession && !loadingSession)
    qc.setQueryData(sessionQuery.queryKey, structuredClone(cloudSession))
  if (!failTeam && !loadingTeam)
    qc.setQueryData(teamQuery(cloudSession?.user.id).queryKey, structuredClone(team))
  publishUsers({ users: [] })
  if (injected)
    publishUsers({
      me: 'me',
      users: [
        {
          id: 'me',
          name: 'Alex',
          email: 'alex@example.com',
          color: 'blue',
          avatar: 'https://example.com/avatar.png'
        },
        { id: 'ada', name: 'Ada', email: 'ada@example.com', color: 'cyan' }
      ]
    })
  const { createRoot } = await import('react-dom/client')
  const root = createRoot(document.getElementById('root')!)
  notifyManager.setNotifyFunction(callback => {
    act(callback)
  })
  const location = memoryLocation({ path: '/settings', record: true })
  await act(async () =>
    root.render(
      <QueryClientProvider client={qc}>
        <Router hook={location.hook}>
          <AccountProvider>{children}</AccountProvider>
        </Router>
      </QueryClientProvider>
    )
  )
  async function settle() {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 5))
    })
  }
  cleanup = async () => {
    await act(async () => root.unmount())
    qc.clear()
    publishUsers({ users: [] })
    layoutEffectSpy.mockRestore()
    configSpy.mockRestore()
    fetchSpy.mockRestore()
    notifyManager.setNotifyFunction(callback => callback())
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
  return {
    document,
    window,
    calls,
    failures,
    mutationRequest,
    teamResponse,
    qc,
    navigations,
    location,
    settle,
    async click(label: string) {
      const button = [...document.querySelectorAll<HTMLElement>('button, [role="menuitem"]')].find(
        button => button.getAttribute('aria-label') === label || button.textContent === label
      )
      expect(button).toBeDefined()
      await act(async () => {
        const event = new window.Event('mousedown', { bubbles: true, cancelable: true })
        Object.defineProperty(event, 'button', { value: 0 })
        button!.dispatchEvent(event)
        button!.click()
      })
      await settle()
    },
    async type(input: HTMLInputElement, value: string) {
      await act(async () => {
        input.type = input.id === 'invite-email' ? 'email' : 'text'
        // React may have loaded before a DOM in the full suite; also exercise its
        // legacy input-event fallback through real focus and keyboard events.
        Object.assign(input, { attachEvent() {}, detachEvent() {} })
        input.dispatchEvent(new window.Event('focusin', { bubbles: true }))
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(
          input,
          value
        )
        input.dispatchEvent(new window.Event('input', { bubbles: true }))
        input.dispatchEvent(new window.Event('keyup', { bubbles: true }))
      })
    }
  }
}

type AccountProbeProps = { children?: ReactNode }
export function AccountProbe({ children }: AccountProbeProps) {
  const account = useAccount()
  return (
    <>
      <p data-account-status>{account.status}</p>
      <p data-account-name>{account.profile?.name}</p>
      {account.status === 'ready' && children}
      {account.registered && (
        <button disabled={account.signOut.isPending} onClick={() => account.signOut.mutate()}>
          Sign out
        </button>
      )}
      {account.signOut.error && <p role="alert">{account.signOut.error.message}</p>}
    </>
  )
}
