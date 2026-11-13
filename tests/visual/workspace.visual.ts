import { expect, takeSnapshot } from '@uiverify/bun'

import type { Identity } from '@/client/features/identity/types'
import type { WorkspaceMembers } from '@/client/features/collab/members/types'
import type { ClientAppConfig } from '@/lib/types'

import { suite, WORKSPACE } from './fixtures'

const { describe, test } = suite(import.meta.path)
const WORKSPACE_PAGE = `/#/workspace/${WORKSPACE}`

describe('Workspace', () => {
  test('home', async page => {
    // Standalone Moi never asks Cloud for shared workspaces.
    const cloudRequests: string[] = []
    await page.route('**/cloud/api/workspaces/**', route => {
      cloudRequests.push(route.request().url())
      return route.fulfill({ status: 500, body: 'Unexpected Cloud request' })
    })
    await page.goto('/#/')
    await expect(page.getByText('acme-store').first()).toBeVisible()
    expect(cloudRequests).toEqual([])
  })

  test(
    'onboarding',
    async page => {
      await page.goto('/#/onboarding')
      await expect(page.getByRole('button').first()).toBeVisible()
    },
    { api: { '/api/settings': { showOnboarding: true, autoUpdateSkills: false } } }
  )

  test('theme', async page => {
    await page.goto(WORKSPACE_PAGE)
    await page.getByRole('button', { name: 'Theme' }).click()
    await expect(page.getByRole('button', { name: 'Close panel' })).toBeVisible()
  })

  test('new workspace', async page => {
    await page.goto('/#/')
    await page.getByRole('button', { name: 'New', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
  })
})

const sharingUser: Identity = {
  id: 'sharing-owner',
  type: 'user',
  name: 'Alex',
  email: 'alex@example.com',
  isAnonymous: false
}
test(
  'sharing duplicate invitation toast',
  async page => {
    await page.goto(WORKSPACE_PAGE)
    await page.getByRole('button', { name: 'Users in this workspace' }).click()
    await expect(page.getByText('tony@example.com', { exact: true }).first()).toBeVisible()
    await page.getByRole('textbox', { name: 'Email', exact: true }).fill('TONY@EXAMPLE.COM')
    await page.getByRole('button', { name: 'Invite', exact: true }).click()
    await expect(page.getByText('The user is already invited', { exact: true })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toHaveValue('')
    await expect(page.getByRole('button', { name: 'Invite', exact: true })).toBeDisabled()
  },
  {
    api: {
      '/api/config': {
        environment: 'cloud',
        demo: false,
        demoInstallUrl: '/'
      } satisfies ClientAppConfig,
      '/cloud/api/me': sharingUser,
      [`/cloud/api/workspaces/${WORKSPACE}/members`]: {
        members: [sharingUser],
        invitations: [
          { id: 'invite-tony', email: 'tony@example.com', expiresAt: '2099-01-01T00:00:00Z' }
        ]
      } satisfies WorkspaceMembers
    }
  }
)

test(
  'active avatar tooltip and sharing controls',
  async page => {
    await page.addInitScript(() => {
      const NativeWebSocket = window.WebSocket
      window.WebSocket = new Proxy(NativeWebSocket, {
        construct(target, args) {
          if (!String(args[0]).includes('/collab')) return Reflect.construct(target, args)
          const socket = {
            readyState: 1,
            onopen: undefined as (() => void) | undefined,
            onmessage: undefined as ((event: MessageEvent) => void) | undefined,
            onclose: undefined as (() => void) | undefined,
            send(data: string) {
              const message = JSON.parse(data)
              if (message.type !== 'join') return
              socket.onmessage?.(
                new MessageEvent('message', {
                  data: JSON.stringify({
                    type: 'welcome',
                    version: 1,
                    connectionId: 'self',
                    users: [
                      message.profile,
                      { id: 'tony', name: 'Tony', email: 'tony@example.com', color: 'blue' }
                    ],
                    connections: [
                      {
                        connectionId: 'self',
                        userId: message.profile.id,
                        location: { page: 'overview', status: 'active' },
                        presence: []
                      },
                      {
                        connectionId: 'tony',
                        userId: 'tony',
                        location: { page: 'scratchpad', status: 'active' },
                        presence: []
                      }
                    ]
                  })
                })
              )
            },
            close() {
              socket.readyState = 3
              queueMicrotask(() => socket.onclose?.())
            }
          }
          queueMicrotask(() => socket.onopen?.())
          return socket
        }
      })
    })
    await page.goto(WORKSPACE_PAGE)
    await page.getByRole('button', { name: 'Tony', exact: true }).hover()
    await expect(
      page.locator('[data-slot="tooltip-content"]').getByText('Scratchpad', { exact: true })
    ).toBeVisible()
    await takeSnapshot('active page tooltip')
    await page.getByRole('button', { name: 'Tony', exact: true }).click()
    await expect(page.getByRole('textbox', { name: 'Email', exact: true })).not.toBeVisible()
    await page.getByRole('button', { name: 'Alex (You), open sharing', exact: true }).click()
    await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toBeVisible()
    const members = page.getByRole('list', { name: 'Who has access' })
    await expect(members.getByText('alex@example.com', { exact: true })).toBeVisible()
    await expect(members.getByText('Tony', { exact: true })).toBeVisible()
    await expect(members.getByText('tony@example.com', { exact: true })).toBeVisible()
    await takeSnapshot('sharing from own avatar')
    await page.getByRole('button', { name: 'Alex (You), open sharing', exact: true }).click()
    await expect(page.getByRole('textbox', { name: 'Email', exact: true })).not.toBeVisible()
  },
  {
    api: {
      '/api/config': {
        environment: 'cloud',
        demo: false,
        demoInstallUrl: '/'
      } satisfies ClientAppConfig,
      '/cloud/api/me': sharingUser,
      [`/cloud/api/workspaces/${WORKSPACE}/members`]: {
        members: [
          sharingUser,
          { id: 'tony', type: 'user', name: 'Tony', email: 'tony@example.com', isAnonymous: false }
        ],
        invitations: []
      } satisfies WorkspaceMembers
    }
  }
)

// Cloud browsers fetch owner content directly and keep visitor preferences local.
const REMOTE = 'shared-board'
const remoteBase = `/api/workspaces/${REMOTE}`
const ownerBase = '/api/workspaces/alice:owner-board'
const remotePage = `/#/workspace/${REMOTE}`
const remoteAnswers = {
  '/api/config': { environment: 'cloud', demo: false },
  '/cloud/api/me': sharingUser,
  '/cloud/api/workspaces/alice:owner-board/members': { members: [sharingUser], invitations: [] },
  [ownerBase]: {
    apiBase: '/api/workspaces/owner-board',
    isRemote: false,
    version: 1,
    name: 'Shared board',
    widgetGrid: [],
    layoutMode: 'fullscreen',
    tabs: { open: ['overview'], active: 'overview' }
  },
  [`${remoteBase}/skills`]: { skills: [], updateAvailable: false },
  [remoteBase]: {
    apiBase: ownerBase,
    isRemote: true,
    version: 2,
    remote: { user_id: 'alice', workspace_id: 'owner-board' },
    cwd: '/visitor'
  },
  [`${remoteBase}/state`]: { revision: 1, selected: {}, sessions: {}, pendingViews: {} },
  [`${ownerBase}/widgets`]: { widgets: [] },
  [`${ownerBase}/views`]: { views: [] },
  [`${ownerBase}/applet-thumbnails`]: { thumbnails: [] }
}

test(
  'remote workspace without chat or setup',
  async page => {
    await page.goto(remotePage)
    await expect(page.getByRole('button', { name: 'Customize', exact: true })).toBeVisible()
    await expect(
      page.getByText('Widgets can surface information, read data, and perform actions')
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'New widget', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Create tab', exact: true })).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Users in this workspace', exact: true })
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Settings', exact: true })).toHaveCount(0)
    await takeSnapshot('remote overview')
    await page.getByRole('button', { name: 'Shared board menu', exact: true }).click()
    await expect(page.getByRole('menuitem', { name: 'Theme', exact: true })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Settings', exact: true })).toHaveCount(0)
  },
  { api: remoteAnswers }
)

test(
  'remote workspace owner unavailable',
  async page => {
    await page.route(`**${ownerBase}`, route =>
      route.fulfill({ status: 502, body: 'Couldn’t reach the workspace owner' })
    )
    await page.goto(remotePage)
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible()
  },
  { api: remoteAnswers }
)

for (const state of ['loading', 'error'] as const) {
  test(
    `shared workspace list ${state}`,
    async page => {
      if (state === 'loading')
        await page.route('**/cloud/api/workspaces/shared', () => new Promise(() => {}))
      else
        await page.route('**/cloud/api/workspaces/shared', route =>
          route.fulfill({ status: 503, json: { error: 'Cloud unavailable' } })
        )
      await page.goto('/#/')
      if (state === 'loading')
        await expect(page.getByText('Loading shared workspaces…')).toBeVisible()
      else await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible()
    },
    {
      api: {
        '/api/config': { environment: 'cloud', demo: false },
        '/cloud/api/workspaces/shared': { workspaces: [] }
      }
    }
  )
}
test(
  'shared workspace opening',
  async page => {
    await page.route('**/api/workspaces/shared/open', () => new Promise(() => {}))
    await page.goto('/#/workspace/alice:board')
    await expect(page.getByRole('status', { name: 'Opening shared workspace' })).toBeVisible()
  },
  { api: { '/api/config': { environment: 'cloud', demo: false }, '/cloud/api/me': sharingUser } }
)
test(
  'shared workspace setup failed',
  async page => {
    await page.route('**/api/workspaces/shared/open', route =>
      route.fulfill({ status: 503, body: 'Could not initialize workspace' })
    )
    await page.goto('/#/workspace/alice:board')
    await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Back', exact: true })).toBeVisible()
  },
  { api: { '/api/config': { environment: 'cloud', demo: false }, '/cloud/api/me': sharingUser } }
)

test(
  'owner-qualified workspace registers and opens the local reference',
  async page => {
    let registrations = 0
    await page.route('**/api/workspaces/shared/open', route => {
      registrations++
      expect(route.request().method()).toBe('POST')
      return route.fulfill({ json: { id: REMOTE, path: '/visitor', addedAt: '' } })
    })
    await page.goto('/#/workspace/alice:owner-board')
    await expect(page.getByRole('button', { name: 'Shared board menu', exact: true })).toBeVisible()
    expect(registrations).toBe(1)
  },
  { api: remoteAnswers }
)

test(
  'home shows local cards while an owner wakes',
  async page => {
    await page.route(`**${ownerBase}`, () => new Promise(() => {}))
    await page.goto('/#/')
    await expect(
      page.getByRole('link', { name: 'Open Local workspace', exact: true })
    ).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open owner-board', exact: true })).toBeVisible()
    await takeSnapshot('home while owner wakes')
  },
  {
    api: {
      ...remoteAnswers,
      '/api/workspaces': [
        { id: WORKSPACE, path: '/local', addedAt: '', name: 'Local workspace' },
        {
          id: REMOTE,
          path: '/visitor',
          addedAt: '',
          name: 'owner-board',
          remote: { user_id: 'alice', workspace_id: 'owner-board' }
        }
      ]
    }
  }
)

test(
  'home mixes unopened shares with registered workspaces',
  async page => {
    await page.route('**/api/workspaces/shared/open', () => new Promise(() => {}))
    await page.goto('/#/')
    const cards = page.getByRole('link', { name: /^Open / })
    await expect(cards).toHaveCount(3)
    await expect(page.getByRole('link', { name: 'Open Alpha', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open Bravo', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open Zebra', exact: true })).toBeVisible()
    await takeSnapshot('mixed workspace grid')
    await page.getByRole('link', { name: 'Open Alpha', exact: true }).click()
    await expect(page.getByRole('status', { name: 'Opening shared workspace' })).toBeVisible()
  },
  {
    api: {
      '/api/config': { environment: 'cloud', demo: false },
      '/api/workspaces': [
        { id: 'local', path: '/Zebra', name: 'Zebra', addedAt: '2026-01-01T00:00:00Z' },
        {
          id: 'registered',
          path: '/visitor',
          name: 'Bravo',
          addedAt: '2026-01-01T00:00:00Z',
          remote: { user_id: 'alice', workspace_id: 'board' }
        }
      ],
      '/api/workspaces/alice:board': { name: 'Bravo' },
      '/api/workspaces/bob:board': { name: 'Alpha' },
      '/cloud/api/workspaces/shared': {
        workspaces: [
          { id: 'board', owner: { id: 'alice', name: 'Alice' } },
          { id: 'board', owner: { id: 'bob', name: 'Bob' } }
        ]
      }
    }
  }
)

test(
  'accept invitation stays home and does not provision',
  async page => {
    let accepted = false
    let provisioned = false
    await page.route('**/cloud/api/workspaces/invitations', route =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          invitations: accepted
            ? []
            : [{ id: 'invite', workspaceName: 'Team notes', inviter: { name: 'Alice' } }]
        })
      })
    )
    await page.route('**/cloud/api/invitations/invite/accept', route => {
      accepted = true
      return route.fulfill({ contentType: 'application/json', body: '{"success":true}' })
    })
    await page.route('**/cloud/api/workspaces/shared', route =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          workspaces: accepted ? [{ id: 'notes', owner: { id: 'alice', name: 'Alice' } }] : []
        })
      })
    )
    await page.route('**/api/workspaces/shared/open', route => {
      provisioned = true
      return route.fulfill({ status: 500, body: 'Should not provision yet' })
    })
    await page.goto('/#/')
    await expect(page.getByRole('button', { name: 'Accept', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Invitations', exact: true })).toBeVisible()
    await takeSnapshot('pending invitation')
    await page.getByRole('button', { name: 'Accept', exact: true }).click()
    await expect(page.getByRole('link', { name: 'Open Team notes', exact: true })).toBeVisible()
    expect(provisioned).toBe(false)
  },
  {
    api: {
      '/api/config': { environment: 'cloud', demo: false },
      '/api/workspaces/alice:notes': { name: 'Team notes' }
    }
  }
)

test(
  'invitation failure can be retried without leaving home',
  async page => {
    await page.route('**/cloud/api/invitations/invite/accept', route =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"error":"Could not accept invitation"}'
      })
    )
    await page.goto('/#/')
    await page.getByRole('button', { name: 'Accept', exact: true }).click()
    await expect(page.getByText('Could not accept invitation', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible()
  },
  {
    api: {
      '/api/config': { environment: 'cloud', demo: false },
      '/cloud/api/workspaces/invitations': {
        invitations: [{ id: 'invite', workspaceName: 'Team notes', inviter: { name: 'Alice' } }]
      }
    }
  }
)

test(
  'failed owner view discovery can be retried',
  async page => {
    let unavailable = true
    await page.addInitScript(() => {
      sessionStorage.setItem(
        'moi:collab:shared-board:tabs',
        JSON.stringify({ open: ['overview', 'views/counter'], active: 'views/counter' })
      )
    })
    await page.route(`**${ownerBase}/views`, route =>
      route.fulfill(
        unavailable
          ? { status: 503, body: 'Owner unavailable' }
          : { json: { views: [{ id: 'counter', status: 'compiled', title: 'Counter' }] } }
      )
    )
    await page.route(`**${ownerBase}/views/counter/module*`, route =>
      route.fulfill({
        contentType: 'text/javascript',
        body: 'export default function Counter() { return "Recovered owner view" }'
      })
    )
    await page.goto(remotePage)
    await expect(page.getByText('Couldn’t load workspace content', { exact: true })).toBeVisible()
    await takeSnapshot('owner content unavailable')
    unavailable = false
    await page.getByRole('button', { name: 'Try again', exact: true }).click()
    await expect(page.getByText('Recovered owner view', { exact: true })).toBeVisible()
  },
  { api: remoteAnswers }
)
