import { expect, spyOn } from 'bun:test'
import { act, useLayoutEffect } from 'react'
import type { ReactNode } from 'react'
import * as layoutEffect from '@base-ui/utils/useIsoLayoutEffect'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'
import { parseHTML } from 'linkedom'
import { QueryClientProvider, notifyManager } from '@tanstack/react-query'
import * as config from '@/client/api/app-config'
import { setExternalUser } from '@/client/features/collab/host-state'
import { AccountProvider, useAccount } from './account-provider'
import { queryClient } from '@/client/api/query-client'
import type { WorkspaceMembers } from '../workspace-members/types'
import { setIdentity } from '../identity/store'
import type { Identity } from '../identity/types'

const session: Identity = {
  id: 'me',
  type: 'user',
  name: 'Alex',
  email: 'alex@example.com',
  isAnonymous: false,
  avatar: 'https://example.com/avatar.png'
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
  pendingMutationPaths?: string[]
  injected?: boolean
  loadingTeam?: boolean
}
export async function mountAccount({
  children = <AccountProbe />,
  anonymous = false,
  signedOut = false,
  demo = false,
  environment = 'cloud',
  failSession = false,
  loadingSession = false,
  pendingMutation = false,
  pendingMutationPaths = [],
  injected = true
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
    CustomEvent: window.CustomEvent,
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
    collab: false,
    demoInstallUrl: '/'
  })
  let cloudSession: Identity | null = signedOut
    ? null
    : { ...session, type: 'user', email: 'alex@example.com', isAnonymous: anonymous }
  const failures = { signOut: false, mutation: false, session: failSession }
  const mutationRequest = Promise.withResolvers<void>()
  let membership: WorkspaceMembers = {
    members: [{ ...session, membershipId: 'member-me' }],
    invitations: []
  }
  const calls: { path: string; body?: Record<string, unknown> }[] = []
  const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input)
        const body = init?.body
          ? (JSON.parse(String(init.body)) as Record<string, string>)
          : undefined
        calls.push({ path, body })
        if (path === '/api/workspaces')
          return Response.json([
            { id: 'one', name: 'First workspace' },
            { id: 'two', name: 'Second workspace' }
          ])
        if (path.endsWith('/identity')) {
          if (loadingSession) return new Promise<Response>(() => {})
          return failures.session
            ? Response.json({ error: 'Session unavailable' }, { status: 503 })
            : cloudSession
              ? Response.json(cloudSession)
              : Response.json({ error: 'No session' }, { status: 401 })
        }
        if (path.endsWith('/members') && (!init?.method || init.method === 'GET'))
          return Response.json(membership)
        if (path.endsWith('/sign-out')) {
          if (failures.signOut)
            return Response.json({ error: 'Try signing out again.' }, { status: 503 })
          cloudSession = null
          return Response.json({ success: true })
        }
        if (
          pendingMutation &&
          (pendingMutationPaths.length === 0 ||
            pendingMutationPaths.some(suffix => path.endsWith(suffix)))
        )
          await mutationRequest.promise
        if (failures.mutation)
          return Response.json({ error: 'Only the owner can do that.' }, { status: 403 })
        if (init?.method === 'DELETE' && path.includes('/members/')) {
          membership = {
            ...membership,
            members: membership.members.filter(
              member => member.membershipId !== path.split('/').at(-1)
            )
          }
          return new Response(null, { status: 204 })
        }
        if (init?.method === 'DELETE' && path.includes('/invitations/')) {
          membership = {
            ...membership,
            invitations: membership.invitations.filter(
              invitation => invitation.id !== path.split('/').at(-1)
            )
          }
          return new Response(null, { status: 204 })
        }
        if (path.endsWith('/invitations')) {
          membership = {
            ...membership,
            invitations: [
              ...membership.invitations,
              { id: 'invite-new', email: body!.email!, expiresAt: '2030-01-01' }
            ]
          }
          return Response.json({ invitation: membership.invitations.at(-1) }, { status: 201 })
        }
        if (path === '/api/settings') return Response.json({ autoUpdateSkills: false, ...body })
        if (path.endsWith('/profile') && cloudSession) {
          cloudSession = {
            ...cloudSession,
            ...(body?.name ? { name: body.name } : {}),
            ...(body?.avatar !== undefined ? { avatar: body.avatar || undefined } : {})
          }
          membership = {
            ...membership,
            members: membership.members.map(member =>
              member.id === cloudSession!.id ? { ...member, ...cloudSession! } : member
            )
          }
          return Response.json({ success: true })
        }
        return Response.json({ success: true })
      },
      { preconnect: fetch.preconnect }
    )
  )
  const qc = queryClient
  qc.clear()
  qc.setDefaultOptions({ queries: { retry: false }, mutations: { retry: false } })
  setIdentity(null)
  setExternalUser(undefined)
  if (!loadingSession && !failSession && environment === 'cloud') setIdentity(cloudSession)
  if (injected)
    setExternalUser({
      id: 'me',
      name: 'Alex',
      email: 'alex@example.com',
      color: 'blue',
      avatar: 'https://example.com/avatar.png'
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
    await qc.cancelQueries()
    await act(async () => {
      root.unmount()
      await new Promise(resolve => setTimeout(resolve, 20))
    })
    qc.clear()
    setIdentity(null)
    setExternalUser(undefined)
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
    qc,
    setMembership: (next: WorkspaceMembers) => {
      membership = next
    },
    navigations,
    location,
    settle,
    async click(label: string) {
      const button = [...document.querySelectorAll<HTMLElement>('button, [role="menuitem"]')].find(
        button =>
          button.getAttribute('aria-label') === label || button.textContent?.trim() === label
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
