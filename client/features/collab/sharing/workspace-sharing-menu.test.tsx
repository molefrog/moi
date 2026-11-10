import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/client/api/query-client'
import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { act } from 'react'
import { toast } from '@/client/components/ui/toast'
import { cleanupAccount, mountAccount } from '../../account/account-test-utils'
import { useWorkspaceMembers } from '../members/hooks'
import { setWorkspaceMembers } from '../members/store'
import { renderToStaticMarkup } from 'react-dom/server'
import { IconLayoutDashboard, IconScribble } from '@tabler/icons-react'
import { Router } from 'wouter'

import type { UserProfile, Connection } from '@/lib/collab/types'

import { WorkspaceSharingMenu } from './workspace-sharing-menu'
import { summarizeWorkspaceUsers } from '../presence/users'
import { WorkspaceMembers } from './workspace-members'
import { Popover } from '@/client/components/ui/popover'
import { createFakeEngine } from '../testing/fake-engine'
import type { FakeEngineOptions } from '../testing/fake-engine'
import { CollabContext, CollabProvider } from '../presence/provider'

const self = { id: 'self', name: 'Self', color: 'emerald' } as const
const active = { id: 'active', name: 'Active colleague', color: 'blue' } as const
const away = { id: 'away', name: 'Away colleague', color: 'blue' } as const
const offline = Array.from(
  { length: 3 },
  (_, index) =>
    ({ id: `offline-${index}`, name: `Offline colleague ${index}`, color: 'blue' }) as const
)

function connection(user: UserProfile, page: string | null): Connection {
  return {
    connectionId: user.id,
    userId: user.id,
    location: page === null ? null : { page, status: 'active' },
    presence: []
  }
}

function describeTab(tab: string) {
  if (tab === 'overview') return { label: 'Overview', Icon: IconLayoutDashboard }
  if (tab === 'scratchpad') return { label: 'Scratchpad', Icon: IconScribble }
  return null
}

function renderSharingMenu(options: FakeEngineOptions) {
  const engine = createFakeEngine({ page: 'overview', ...options })
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <Router ssrPath="/workspace/test/overview">
        <CollabContext value={engine}>
          <WorkspaceSharingMenu workspaceId="test" describeTab={describeTab} onOpenTab={() => {}} />
        </CollabContext>
      </Router>
    </QueryClientProvider>
  )
}

function renderMembersPanel(options: FakeEngineOptions) {
  const engine = createFakeEngine({ page: 'overview', ...options })
  function Panel() {
    const membership = useWorkspaceMembers('test')
    return (
      <WorkspaceMembers
        workspaceId="test"
        membership={membership}
        users={summarizeWorkspaceUsers(engine.getUsersSnapshot().connections, {
          currentUser: options.self,
          users: options.users ?? [],
          page: 'overview'
        })}
      />
    )
  }
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <Router ssrPath="/workspace/test/overview">
        <CollabContext value={engine}>
          <Popover>
            <Panel />
          </Popover>
        </CollabContext>
      </Router>
    </QueryClientProvider>
  )
}

test('menu stays visible for a single member even with multiple open tabs', () => {
  expect(
    renderSharingMenu({
      self,
      users: [self],
      otherConnections: [connection(self, 'scratchpad')]
    })
  ).toContain('aria-label="Users in this workspace"')
})

test('header shows only active users, reversed from the popup order', () => {
  const html = renderSharingMenu({
    self,
    users: [...offline, active, self, away],
    otherConnections: [connection(active, 'overview'), connection(away, null)]
  })
  expect(html).toContain('aria-label="Active colleague"')
  expect(html).not.toContain('aria-label="Away colleague"')
  expect(html).not.toContain('Offline colleague')
  expect(html.indexOf('aria-label="Active colleague"')).toBeLessThan(
    html.indexOf('aria-label="Self"')
  )
})

test('header limits active avatars to four and puts the overflow on the left', () => {
  const peers = Array.from(
    { length: 5 },
    (_, i) => ({ id: `p${i}`, name: `Peer ${i}`, color: 'blue' }) as const
  )
  const html = renderSharingMenu({
    self,
    users: [...peers, self],
    otherConnections: peers.map(p => connection(p, 'overview'))
  })
  expect(html).toContain('aria-label="2 more active users"')
  expect(html).not.toContain('aria-label="Peer 3"')
  const labels = ['2 more active users', 'Peer 2', 'Peer 1', 'Peer 0', 'Self']
  for (let i = 1; i < labels.length; i++) {
    expect(html.indexOf(`aria-label="${labels[i - 1]}"`)).toBeLessThan(
      html.indexOf(`aria-label="${labels[i]}"`)
    )
  }
})

test('popup puts self first, active members next, and preserves remaining member order', () => {
  const html = renderMembersPanel({
    self,
    users: [offline[0], away, active, self],
    otherConnections: [connection(active, 'scratchpad'), connection(away, null)]
  })
  const order = [self, active, offline[0], away]
  for (let i = 1; i < order.length; i++) {
    expect(html.indexOf(`aria-label="${order[i - 1].name}"`)).toBeLessThan(
      html.indexOf(`aria-label="${order[i].name}"`)
    )
  }
  expect(html).not.toContain('>Scratchpad<')
  expect(html).not.toContain('>Away<')
  expect(html).not.toContain('>Offline<')
})

test('member rows show name and email, falling back to email for missing names', () => {
  const named = { ...active, email: 'active@example.com' }
  const unnamed = { ...away, name: '', email: 'away@example.com' }
  const html = renderMembersPanel({ self, users: [self, named, unnamed] })
  expect(html).toContain('>Active colleague<')
  expect(html).toContain('>active@example.com<')
  expect(html.match(/>away@example.com</g)).toHaveLength(2)
})

test('an authoritative empty directory does not leak live users into avatars', () => {
  const html = renderSharingMenu({
    self,
    users: [],
    otherConnections: [connection(active, 'overview')]
  })
  expect(html).not.toContain('aria-label="Self"')
  expect(html).not.toContain('Active colleague')
})

test('menu stays visible without a current user', () => {
  expect(
    renderSharingMenu({
      self: undefined,
      users: [active],
      otherConnections: [connection(active, 'overview')]
    })
  ).toContain('aria-label="Users in this workspace"')
})

describe('workspace sharing', () => {
  afterEach(cleanupAccount)

  test('disabled presence loads workspace members and reflects membership updates', async () => {
    const ui = await mountAccount({
      children: (
        <CollabProvider workspaceId="one" enabled={false}>
          <WorkspaceSharingMenu workspaceId="one" describeTab={() => null} onOpenTab={() => {}} />
        </CollabProvider>
      )
    })
    await ui.settle()
    await ui.click('Users in this workspace')
    expect(ui.calls.some(call => call.path.endsWith('/workspaces/one/members'))).toBe(true)
    expect(ui.document.body.textContent).toContain('Alex')
    expect(ui.document.body.textContent).not.toContain('Offline')
    expect(ui.document.body.textContent).not.toContain('Invite your agent')
    expect(ui.document.body.textContent).not.toContain('Copy prompt')

    const tony = {
      id: 'tony',
      type: 'user',
      name: 'Tony',
      email: 'tony@example.com',
      isAnonymous: false
    } as const
    await act(async () => setWorkspaceMembers('one', { members: [tony], invitations: [] }))
    await ui.settle()
    expect(ui.document.body.textContent).toContain('Tony')
    await act(async () => setWorkspaceMembers('one', { members: [], invitations: [] }))
    await ui.settle()
    expect(ui.document.body.textContent).not.toContain('Tony')
    expect(ui.document.body.textContent).toContain('Alex')
    expect(ui.document.body.textContent).toContain('(You)')
    expect(ui.document.querySelector('[aria-label="Loading workspace members"]')).toBeNull()
    expect(ui.document.querySelector('[aria-label="Users in this workspace"]')).not.toBeNull()
  })

  test('membership loading and failure recover to the current user on retry', async () => {
    const ui = await mountAccount({
      pendingMembership: true,
      children: (
        <CollabProvider workspaceId="one" enabled={false}>
          <WorkspaceSharingMenu workspaceId="one" describeTab={() => null} onOpenTab={() => {}} />
        </CollabProvider>
      )
    })
    await ui.settle()
    await ui.click('Users in this workspace')
    expect(ui.document.querySelector('[aria-label="Loading workspace members"]')).not.toBeNull()
    ui.failures.membership = true
    await act(async () => ui.membershipRequest.resolve())
    await ui.settle()
    expect(ui.document.body.textContent).toContain('Couldn’t refresh workspace members')
    expect(ui.document.querySelector('[aria-label="Loading workspace members"]')).toBeNull()
    ui.failures.membership = false
    ui.setMembership({ members: [], invitations: [] })
    await ui.click('Retry')
    await ui.settle()
    const list = ui.document.querySelector('[aria-label="Who has access"]')!
    expect(list.textContent).toContain('Alex')
    expect(list.textContent).toContain('(You)')
    expect(ui.document.body.textContent).not.toContain('Couldn’t refresh workspace members')
  })

  test('header navigation, self, overflow, and empty presence keep distinct actions', async () => {
    const peers = [active, away, ...offline.slice(0, 3)]
    const engine = createFakeEngine({
      self,
      users: [self, ...peers],
      page: 'overview',
      otherConnections: peers.map(p => connection(p, p === away ? 'views/deleted' : 'scratchpad'))
    })
    const opened: string[] = []
    const ui = await mountAccount({
      children: (
        <CollabContext value={engine}>
          <WorkspaceSharingMenu
            workspaceId="one"
            describeTab={describeTab}
            onOpenTab={tab => opened.push(tab)}
          />
        </CollabContext>
      )
    })
    ui.setMembership({
      members: [self, ...peers].map(profile => ({
        id: profile.id,
        type: 'user',
        name: profile.name,
        email: `${profile.id}@example.com`,
        isAnonymous: false
      })),
      invitations: []
    })
    await ui.settle()
    await act(async () => {
      await ui.qc.invalidateQueries()
    })
    await ui.settle()
    await ui.click('Active colleague')
    expect(opened).toEqual(['scratchpad'])
    expect(ui.document.querySelector('form')).toBeNull()
    await ui.click('Away colleague')
    expect(opened).toEqual(['scratchpad'])
    expect(ui.document.querySelector('form')).toBeNull()
    await act(async () => engine.setOtherConnections(peers.map(p => connection(p, 'overview'))))
    await ui.click('Active colleague')
    expect(opened).toEqual(['scratchpad'])
    await ui.click('Self (You), open sharing')
    expect(ui.document.querySelector('form')).not.toBeNull()
    await ui.click('Self (You), open sharing')
    expect(ui.document.querySelector('form')).toBeNull()
    await ui.click('2 more active users')
    expect(ui.document.querySelector('form')).not.toBeNull()
    await ui.click('2 more active users')
    expect(ui.document.querySelector('form')).toBeNull()
    await act(async () => {
      engine.setOtherConnections([])
      engine.setLocation({ page: 'overview', status: 'away' })
    })
    expect(ui.document.querySelector('[aria-label="Self (You), open sharing"]')).toBeNull()
    await ui.click('Users in this workspace')
    expect(ui.document.querySelector('form')).not.toBeNull()
    await act(async () => engine.setLocation({ page: 'overview', status: 'active' }))
    expect(ui.document.querySelector('[aria-label="Self (You), open sharing"]')).not.toBeNull()
  })

  test('invitation uses the cloud API, shows a toast and pending participant, and supports retry', async () => {
    const notification = spyOn(toast, 'add')
    try {
      const ui = await mountAccount({
        pendingMutation: true,
        pendingMutationPaths: ['/invitations'],
        children: (
          <CollabProvider workspaceId="one" enabled={false}>
            <WorkspaceSharingMenu workspaceId="one" describeTab={() => null} onOpenTab={() => {}} />
          </CollabProvider>
        )
      })
      await ui.settle()
      await ui.click('Users in this workspace')
      const input = ui.document.querySelector<HTMLInputElement>('[aria-label="Email"]')!
      await ui.type(input, 'Tony@Example.com')
      const submit = async () => {
        await act(async () => {
          ui.document
            .querySelector('form')!
            .dispatchEvent(new ui.window.Event('submit', { bubbles: true, cancelable: true }))
        })
        await ui.settle()
      }
      ui.failures.mutation = true
      await submit()
      expect(input.value).toBe('')
      const inviteButton = ui.document.querySelector<HTMLButtonElement>('button[type="submit"]')!
      expect(inviteButton.textContent).toBe('Invite')
      expect(inviteButton.disabled).toBe(true)
      expect(ui.document.body.textContent).not.toContain('Sending…')
      const pendingRow = ui.document.querySelector('[aria-label="Who has access"] li:last-child')!
      expect(pendingRow.textContent?.match(/tony@example.com/g)).toHaveLength(2)
      expect(pendingRow.querySelector<HTMLButtonElement>('button')?.disabled).toBe(true)
      await act(async () => ui.mutationRequest.resolve())
      await ui.settle()
      expect(input.value).toBe('Tony@Example.com')
      expect(notification).toHaveBeenCalledWith({
        title: 'Couldn’t send invitation',
        description: 'Only the owner can do that.',
        type: 'error'
      })
      expect(ui.document.querySelector('[aria-label="Who has access"]')?.textContent).not.toContain(
        'tony@example.com'
      )
      ui.failures.mutation = false
      await submit()
      expect(ui.calls).toContainEqual({
        path: '/cloud/api/workspaces/one/invitations',
        body: { email: 'tony@example.com', workspaceName: 'First workspace' }
      })
      expect(input.value).toBe('')
      expect(notification).toHaveBeenCalledWith({
        title: 'Invitation sent',
        description: 'Sent to tony@example.com',
        type: 'success'
      })
      expect(
        ui.document
          .querySelector('[aria-label="Who has access"]')
          ?.textContent?.match(/tony@example.com/g)
      ).toHaveLength(2)
    } finally {
      notification.mockRestore()
    }
  })

  for (const existing of ['member', 'invitation'] as const) {
    test(`duplicate ${existing} clears the form without sending or adding a row`, async () => {
      const notification = spyOn(toast, 'add')
      try {
        const ui = await mountAccount({
          children: (
            <CollabProvider workspaceId="one" enabled={false}>
              <WorkspaceSharingMenu
                workspaceId="one"
                describeTab={() => null}
                onOpenTab={() => {}}
              />
            </CollabProvider>
          )
        })
        ui.setMembership({
          members: [
            { id: 'me', type: 'user', name: 'Alex', email: 'alex@example.com', isAnonymous: false }
          ],
          invitations:
            existing === 'invitation'
              ? [
                  {
                    id: 'invite-tony',
                    email: 'tony@example.com',
                    expiresAt: '2099-01-01T00:00:00Z'
                  }
                ]
              : []
        })
        await ui.settle()
        await act(async () => {
          await ui.qc.invalidateQueries()
        })
        await ui.settle()
        await ui.click('Users in this workspace')
        const list = ui.document.querySelector('[aria-label="Who has access"]')!
        const rows = list.children.length
        const address = existing === 'member' ? 'alex@example.com' : 'tony@example.com'
        const input = ui.document.querySelector<HTMLInputElement>('[aria-label="Email"]')!
        await ui.type(input, address.toUpperCase())
        await act(async () => {
          ui.document
            .querySelector('form')!
            .dispatchEvent(new ui.window.Event('submit', { bubbles: true, cancelable: true }))
        })
        await ui.settle()
        expect(input.value).toBe('')
        expect(
          ui.document.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled
        ).toBe(true)
        expect(list.children.length).toBe(rows)
        expect(ui.calls.filter(call => call.path.endsWith('/invitations'))).toHaveLength(0)
        expect(notification).toHaveBeenCalledWith({
          title:
            existing === 'member'
              ? 'The user is already in this workspace'
              : 'The user is already invited',
          type: 'info'
        })
      } finally {
        notification.mockRestore()
      }
    })
  }

  for (const code of ['ALREADY_MEMBER', 'ALREADY_OWNER', 'ALREADY_INVITED']) {
    test(`API ${code} shows information and keeps the input cleared`, async () => {
      const notification = spyOn(toast, 'add')
      try {
        const ui = await mountAccount({
          children: (
            <CollabProvider workspaceId="one" enabled={false}>
              <WorkspaceSharingMenu
                workspaceId="one"
                describeTab={() => null}
                onOpenTab={() => {}}
              />
            </CollabProvider>
          )
        })
        await ui.settle()
        await ui.click('Users in this workspace')
        const fetch = globalThis.fetch
        spyOn(globalThis, 'fetch').mockImplementation(
          Object.assign(
            async (input: RequestInfo | URL, init?: RequestInit) =>
              String(input).endsWith('/invitations')
                ? Response.json({ code, message: 'Duplicate' }, { status: 409 })
                : fetch(input, init),
            { preconnect: fetch.preconnect }
          )
        )
        const input = ui.document.querySelector<HTMLInputElement>('[aria-label="Email"]')!
        await ui.type(input, 'Tony@Example.com')
        await act(async () => {
          ui.document
            .querySelector('form')!
            .dispatchEvent(new ui.window.Event('submit', { bubbles: true, cancelable: true }))
        })
        await ui.settle()
        await ui.settle()
        expect(input.value).toBe('')
        expect(
          ui.document.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled
        ).toBe(true)
        expect(
          ui.document.querySelector('[aria-label="Who has access"]')!.textContent
        ).not.toContain('tony@example.com')
        expect(notification).toHaveBeenCalledWith({
          title:
            code === 'ALREADY_INVITED'
              ? 'The user is already invited'
              : 'The user is already in this workspace',
          type: 'info'
        })
      } finally {
        notification.mockRestore()
      }
    })
  }

  test('one participant list removes members, revokes invitations and restores failed removals', async () => {
    const notification = spyOn(toast, 'add')
    try {
      const ui = await mountAccount({
        children: (
          <CollabProvider workspaceId="one" enabled={false}>
            <WorkspaceSharingMenu workspaceId="one" describeTab={() => null} onOpenTab={() => {}} />
          </CollabProvider>
        )
      })
      await ui.settle()
      const data = {
        members: [
          { id: 'me', type: 'user', name: 'Alex', email: 'alex@example.com', isAnonymous: false },
          {
            id: 'tony',
            type: 'user',
            name: 'Tony',
            email: 'tony@example.com',
            isAnonymous: false,
            membershipId: 'member-tony'
          }
        ],
        invitations: [
          { id: 'invite-sam', email: 'sam@example.com', expiresAt: '2030-01-01T00:00:00Z' }
        ]
      } as const
      const snapshot = { members: [...data.members], invitations: [...data.invitations] }
      ui.setMembership(snapshot)
      await act(async () => setWorkspaceMembers('one', snapshot))
      await ui.click('Users in this workspace')
      const list = ui.document.querySelector('[aria-label="Who has access"]')!
      expect(list.querySelectorAll('li')).toHaveLength(3)
      expect(list.textContent).toContain('Tony')
      expect(list.textContent).toContain('sam@example.com')
      expect(list.children[0]!.querySelector('button')).toBeNull()
      ui.failures.mutation = true
      await ui.click('Remove')
      expect(list.textContent).toContain('Tony')
      expect(notification).toHaveBeenCalledWith({
        title: 'Couldn’t remove member',
        description: 'Only the owner can do that.',
        type: 'error'
      })
      ui.failures.mutation = false
      await ui.click('Remove')
      expect(ui.calls.some(call => call.path.endsWith('/members/member-tony'))).toBe(true)
      expect(list.textContent).not.toContain('Tony')
      expect(list.textContent).toContain('sam@example.com')
      await ui.click('Revoke invitation')
      expect(ui.calls.some(call => call.path.endsWith('/invitations/invite-sam'))).toBe(true)
      expect(list.textContent).not.toContain('sam@example.com')
      expect(list.textContent).toContain('Alex')
    } finally {
      notification.mockRestore()
    }
  })
})
