import { DEFAULT_VIEWPORT, expect, type Page, takeSnapshot } from '@uiverify/bun'

import { BUILT_WORKSPACE, DEMO_WORKSPACE } from './demo-workspace'
import { PAGE_VIEWPORTS, visualSuite } from './fixtures'
import { CHAT_SESSION_ID } from './seed/chat-session'
import { agentResponse, CONNECTORS } from './server-responses'

// Opening a workspace page saves its tabs on the server, which makes every
// open page of that workspace refetch it. The tests in this file run one at a
// time, in file order, so that never lands mid-capture; the tests that add
// state to a workspace come last in their group.
const { describe, test } = visualSuite(import.meta.path)

async function openHome(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('link', { name: `Chat in ${BUILT_WORKSPACE}` })).toBeVisible()
  await expect(page.getByRole('link', { name: `Chat in ${DEMO_WORKSPACE}` })).toBeVisible()
}

async function openCreateDialog(page: Page) {
  await openHome(page)
  await page.getByRole('button', { name: 'New', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('textbox', { name: 'Workspace name' })).toBeVisible()
  return dialog
}

describe('Home', { viewports: PAGE_VIEWPORTS }, () => {
  test('workspace list', async page => {
    await openHome(page)
    await takeSnapshot()
  })

  test('no workspaces yet', async page => {
    page.route('**/api/workspaces', route => route.fulfill({ json: [] }))
    await page.goto('/')
    await expect(page.getByText('Let’s start with creating your first workspace')).toBeVisible()
    await takeSnapshot()
  })

  test('workspaces fail to load', async page => {
    page.route('**/api/workspaces', route => route.fulfill({ status: 500, body: 'boom' }))
    await page.goto('/')
    await expect(page.getByText('Could not load spaces.')).toBeVisible()
    await takeSnapshot()
  })

  test('an update is available', async page => {
    page.route('**/api/update', route =>
      route.fulfill({ json: { runningVersion: '0.12.1', availableVersion: '0.13.0' } })
    )
    await openHome(page)
    await expect(page.getByRole('button', { name: /update/i })).toBeVisible()
    await takeSnapshot()
  })

  test('create workspace: name it', async page => {
    await openCreateDialog(page)
    await takeSnapshot()
  })

  test('create workspace: invalid name', async page => {
    const dialog = await openCreateDialog(page)
    await dialog.getByRole('textbox', { name: 'Workspace name' }).fill('orders/2026')
    await expect(dialog.getByRole('button', { name: 'Next', exact: true })).toBeDisabled()
    await takeSnapshot()
  })

  // A hover state: a phone has no pointer to hover with.
  test(
    'create workspace: existing folder is not supported yet',
    async page => {
      const dialog = await openCreateDialog(page)
      await dialog.getByRole('button', { name: 'Use existing folder' }).hover()
      await expect(page.getByText('Not supported yet')).toBeVisible()
      await takeSnapshot()
    },
    { viewports: { '': DEFAULT_VIEWPORT } }
  )

  test('create workspace: choose agent', async page => {
    const dialog = await openCreateDialog(page)
    await dialog.getByRole('textbox', { name: 'Workspace name' }).fill('orders-dashboard')
    await dialog.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(dialog.getByText('ChatGPT')).toBeVisible()
    await takeSnapshot()
  })
})

// On a phone the chat folds into the Agent button, so a workspace has loaded
// once either the chat or that button shows.
async function openWorkspace(page: Page, id: string, tab = 'overview') {
  await page.goto(`/workspace/${id}/${tab}`)
  const send = page.getByRole('button', { name: 'Send message' })
  const agent = page.getByRole('button', { name: 'Agent', exact: true })
  await page.waitUntil(
    'the chat or the Agent button',
    async () => (await send.isVisible()) || (await agent.isVisible())
  )
  if ((await send.isVisible()) && !tab.startsWith('chats/')) {
    await expect(page.getByText('moi is the personal workspace built for you')).toBeVisible()
  }
}

// Opens the chat where it is folded away (a phone); a no-op on desktop.
async function openChat(page: Page) {
  const agent = page.getByRole('button', { name: 'Agent', exact: true })
  if (await agent.isVisible()) await agent.click()
  await expect(page.getByRole('button', { name: 'Send message' })).toBeVisible()
}

// Each widget waits at opacity 0 until its bundle loads, then blurs in, and
// toBeVisible() ignores opacity.
async function expectWidgetsShown(page: Page) {
  await expect(page.getByText('Waiting to ship')).toBeVisible()
  await expect(page.locator('.react-grid-item [style*="opacity: 0"]')).toHaveCount(0)
}

async function openSettings(page: Page, section: string) {
  await page.getByRole('button', { name: 'Settings' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: section, exact: true }).click()
  await expect(dialog.getByRole('heading', { name: section })).toBeVisible()
  return dialog
}

describe('New workspace', { viewports: PAGE_VIEWPORTS }, () => {
  test('overview', async page => {
    await openWorkspace(page, DEMO_WORKSPACE)
    await expect(page.getByText('Widgets can surface information')).toBeVisible()
    await takeSnapshot()
  })

  describe(
    'agent signed out',
    {
      agentAvailability: {
        status: 'login-required',
        reason: 'Claude is signed out. Sign in to send messages'
      }
    },
    () => {
      test('workspace asks to log in', async page => {
        await page.goto(`/workspace/${DEMO_WORKSPACE}/overview`)
        await expect(page.getByRole('heading', { name: 'Log in to Claude' })).toBeVisible()
        await takeSnapshot()
      })
    }
  )

  describe(
    'agent not installed',
    {
      agentAvailability: {
        status: 'unavailable',
        reason: 'Claude Code is not installed',
        code: 'not-installed'
      }
    },
    () => {
      test('workspace says the agent is missing', async page => {
        await page.goto(`/workspace/${DEMO_WORKSPACE}/overview`)
        await expect(
          page.getByRole('heading', { name: 'Claude is uninstalled from the device' })
        ).toBeVisible()
        await takeSnapshot()
      })
    }
  )

  describe(
    'agent unavailable',
    {
      agentAvailability: {
        status: 'unavailable',
        reason: 'The Claude Code CLI exited before it answered.'
      }
    },
    () => {
      test('workspace shows why', async page => {
        await page.goto(`/workspace/${DEMO_WORKSPACE}/overview`)
        await expect(page.getByText('The Claude Code CLI exited before it answered.')).toBeVisible()
        await takeSnapshot()
      })
    }
  )

  test('workspace folder is missing', async page => {
    page.route(/\/api\/workspaces\/[^/]+\/agent(\?|$)/, route =>
      route.fulfill({
        json: { ...agentResponse({ status: 'available' }), workspaceFolderMissing: true }
      })
    )
    await page.goto(`/workspace/${DEMO_WORKSPACE}/overview`)
    await expect(
      page.getByRole('heading', { name: 'The workspace folder is missing' })
    ).toBeVisible()
    await takeSnapshot()
  })

  test('customize', async page => {
    await openWorkspace(page, DEMO_WORKSPACE)
    await page.getByRole('button', { name: 'Customize' }).click()
    await expect(page.getByRole('button', { name: 'Done' })).toBeVisible()
    // Widgets wiggle for as long as customize mode is on; hold them still.
    await page.addStyleTag({ content: '.group\\/widget { transform: none !important; }' })
    await takeSnapshot()
  })

  test('theme panel', async page => {
    await openWorkspace(page, DEMO_WORKSPACE)
    await page.getByRole('button', { name: 'Theme' }).click()
    await expect(page.getByText('Radius')).toBeVisible()
    await takeSnapshot()
  })

  // Desktop only: on a phone the toolbar covers the workspace icon, so the
  // picker cannot be opened there (the mobile overview capture shows it).
  test(
    'workspace icon picker',
    async page => {
      await openWorkspace(page, DEMO_WORKSPACE)
      await page.getByRole('button', { name: 'Change workspace icon' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await takeSnapshot()
    },
    { viewports: { '': DEFAULT_VIEWPORT } }
  )

  test('tab menu', async page => {
    await openWorkspace(page, DEMO_WORKSPACE)
    await page.getByRole('button', { name: 'Create tab' }).click()
    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible()
    await takeSnapshot()
  })

  test('workspace menu', async page => {
    await openWorkspace(page, DEMO_WORKSPACE)
    await page.getByRole('button', { name: `${DEMO_WORKSPACE} menu` }).click()
    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible()
    await takeSnapshot()
  })

  test('settings: general', async page => {
    // The workspace lives in a per-run temp folder; show the path a user would see.
    page.route(`**/api/workspaces/${DEMO_WORKSPACE}`, async route => {
      // The same URL also takes the layout saves.
      const request = route.request()
      if (request.method() !== 'GET') return route.fallback()
      const workspace = await (await fetch(request.url(), { headers: request.headers() })).json()
      route.fulfill({ json: { ...workspace, cwd: `~/projects/${DEMO_WORKSPACE}` } })
    })
    await openWorkspace(page, DEMO_WORKSPACE)
    const dialog = await openSettings(page, 'General')
    await expect(dialog.getByLabel('Workspace path', { exact: true })).toHaveValue(
      `~/projects/${DEMO_WORKSPACE}`
    )
    await takeSnapshot()
  })

  test('settings: remove workspace', async page => {
    await openWorkspace(page, DEMO_WORKSPACE)
    await openSettings(page, 'General')
    await page.getByRole('button', { name: 'Remove' }).click()
    const confirm = page.getByRole('alertdialog')
    await expect(confirm).toBeVisible()
    await takeSnapshot()
  })

  test('settings: no connectors', async page => {
    await openWorkspace(page, DEMO_WORKSPACE)
    const dialog = await openSettings(page, 'Connectors')
    await expect(dialog.getByText('No connectors configured.')).toBeVisible()
    await takeSnapshot()
  })

  test('settings: connectors in every state', async page => {
    page.route('**/api/workspaces/*/mcp', route => route.fulfill({ json: CONNECTORS }))
    await openWorkspace(page, DEMO_WORKSPACE)
    const dialog = await openSettings(page, 'Connectors')
    await expect(dialog.getByText('sentry')).toBeVisible()
    await takeSnapshot()
  })

  test('settings: no environment variables', async page => {
    await openWorkspace(page, DEMO_WORKSPACE)
    const dialog = await openSettings(page, 'Environment')
    await expect(dialog.getByText('No variables yet.')).toBeVisible()
    await takeSnapshot()
  })

  test('a view that does not exist', async page => {
    await page.goto(`/workspace/${DEMO_WORKSPACE}/views/does-not-exist`)
    await expect(page.getByRole('button', { name: 'Back to overview' })).toBeVisible()
    // The chat shows up after the page: docked on desktop, folded into the
    // Agent button on a phone.
    const agent = page.getByRole('button', { name: 'Agent' })
    const send = page.getByRole('button', { name: 'Send message' })
    await page.waitUntil(
      'the chat to show',
      async () => (await agent.isVisible()) || (await send.isVisible())
    )
    await takeSnapshot()
  })

  test('scratchpad', async page => {
    await openWorkspace(page, DEMO_WORKSPACE, 'scratchpad')
    await expect(page.locator('.tl-canvas')).toBeVisible()
    await takeSnapshot()
  })

  test('new view draft', async page => {
    await openWorkspace(page, DEMO_WORKSPACE)
    await page.getByRole('button', { name: 'Create new view' }).click()
    await expect(page.getByText('Sketch how the view should look')).toBeVisible()
    await takeSnapshot()
  })
})

describe('Built workspace', { viewports: PAGE_VIEWPORTS }, () => {
  test('overview with widgets and a theme', async page => {
    await openWorkspace(page, BUILT_WORKSPACE)
    await expectWidgetsShown(page)
    await takeSnapshot()
  })

  test('a view the agent built', async page => {
    await openWorkspace(page, BUILT_WORKSPACE, 'views/orders')
    await expect(page.getByText('38 orders today, 4 waiting to ship.')).toBeVisible()
    await takeSnapshot()
  })

  test('chat history', async page => {
    await openWorkspace(page, BUILT_WORKSPACE)
    await openChat(page)
    await page.getByRole('button', { name: 'History' }).click()
    const menu = page.getByRole('menu')
    await expect(
      menu.getByText("Add a widget to the overview with today's orders", { exact: false })
    ).toBeVisible()
    await takeSnapshot()
  })

  test('model menu', async page => {
    await openWorkspace(page, BUILT_WORKSPACE)
    await openChat(page)
    await page.getByRole('button', { name: /^Model:/ }).click()
    const menu = page.getByRole('menu')
    await expect(menu.getByText('Opus')).toBeVisible()
    await takeSnapshot()
  })

  test('settings: environment variables', async page => {
    await openWorkspace(page, BUILT_WORKSPACE)
    const dialog = await openSettings(page, 'Environment')
    // Attached rather than visible: on a phone the settings panel is too
    // narrow to show the variable names, and the capture records that.
    await expect(dialog.getByText('SHOP_API_URL')).toBeAttached()
    await takeSnapshot()
  })

  describe('narrow window', { viewports: { '': { width: 1024, height: 768 } } }, () => {
    test('chat folds into a button', async page => {
      await page.goto(`/workspace/${BUILT_WORKSPACE}/overview`)
      await expect(page.getByRole('button', { name: 'Agent' })).toBeVisible()
      await expectWidgetsShown(page)
      await takeSnapshot()
    })
    test('chat as a popup', async page => {
      await page.goto(`/workspace/${BUILT_WORKSPACE}/overview`)
      await expectWidgetsShown(page)
      await page.getByRole('button', { name: 'Agent' }).click()
      await expect(page.getByRole('button', { name: 'Send message' })).toBeVisible()
      await takeSnapshot()
    })
  })

  // Last: opening a chat makes it the workspace's selected chat on the server,
  // so every later page of this workspace would open on it.
  test('chat with a finished conversation', async page => {
    await openWorkspace(page, BUILT_WORKSPACE, `chats/${CHAT_SESSION_ID}`)
    await expect(page.getByText('Orders today is on your overview', { exact: false })).toBeVisible()
    await takeSnapshot()
  })
})
