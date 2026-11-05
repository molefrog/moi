import { expect } from '@uiverify/bun'

import { HARNESSES, suite, WORKSPACE } from './fixtures'

const { describe, test } = suite(import.meta.path)
const WORKSPACE_PAGE = `/#/workspace/${WORKSPACE}`

describe('Chat', () => {
  // The conversation from the chat playground (chat-states-fixtures.ts) holds
  // every message, tool and notice state; a tall window shows all of it.
  test(
    'every message and tool state',
    async page => {
      await page.goto(WORKSPACE_PAGE)
      await expect(page.getByText('On it — three in flight:')).toBeVisible()
    },
    { viewports: { '': { width: 1280, height: 4400 } } }
  )

  test(
    'new chat',
    async page => {
      await page.goto(WORKSPACE_PAGE)
      await expect(page.getByPlaceholder('Do anything')).toBeVisible()
    },
    {
      api: {
        [`/api/workspaces/${WORKSPACE}/state`]: {
          revision: 1,
          selected: {},
          sessions: {},
          pendingViews: {}
        },
        [`/api/workspaces/${WORKSPACE}/sessions`]: []
      }
    }
  )

  test('message typed', async page => {
    await page.goto(WORKSPACE_PAGE)
    await page.getByPlaceholder('Do anything').fill('Add a revenue widget for this week')
    await expect(page.getByRole('button', { name: 'Send message' })).not.toBeDisabled()
  })

  test('model picker', async page => {
    await page.goto(WORKSPACE_PAGE)
    await page.getByRole('button', { name: 'Model: Opus' }).click()
    await expect(page.getByRole('menuitemradio', { name: 'Fable' })).toBeVisible()
  })

  test('effort picker', async page => {
    await page.goto(WORKSPACE_PAGE)
    await page.getByRole('button', { name: 'Effort: High' }).click()
    await expect(page.getByRole('slider', { name: 'Reasoning effort' })).toBeVisible()
  })

  test(
    'agent signed out',
    async page => {
      await page.goto(WORKSPACE_PAGE)
      await expect(page.getByText('Set up Claude')).toBeVisible()
    },
    {
      api: {
        '/api/harnesses/status': {
          ...HARNESSES,
          'claude-code': {
            availability: { status: 'login-required', reason: 'Claude is signed out' }
          }
        },
        [`/api/workspaces/${WORKSPACE}/harness`]: {
          provider: 'claude-code',
          availability: { status: 'login-required', reason: 'Claude is signed out' },
          models: []
        }
      }
    }
  )
})
