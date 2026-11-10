import { expect, takeSnapshot } from '@uiverify/bun'

import type { Identity } from '@/client/features/identity/types'
import type { WorkspaceMembers } from '@/client/features/collab/members/types'
import type { ClientAppConfig } from '@/lib/types'

import { suite, WORKSPACE } from './fixtures'

const { describe, test } = suite(import.meta.path)
const WORKSPACE_PAGE = `/#/workspace/${WORKSPACE}`

describe('Workspace', () => {
  test('home', async page => {
    await page.goto('/#/')
    await expect(page.getByText('acme-store').first()).toBeVisible()
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
          if (!String(args[0]).includes('/collab/ws')) return Reflect.construct(target, args)
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
