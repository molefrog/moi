import { expect, type Page, takeSnapshot } from '@uiverify/bun'

import { holdSportIcon, PAGE_VIEWPORTS, visualSuite } from './fixtures'

const { describe, beforeEach, test } = visualSuite(import.meta.path)

describe('Chat states', () => {
  beforeEach(async page => {
    await page.goto('/dev/chat-states')
    await expect(page.getByRole('heading', { name: 'Layout save race' })).toBeVisible()
    await holdSportIcon(page)
  })

  // The fixed control panel and the anchor list are playground chrome, not
  // chat UI.
  async function hideControls(page: Page) {
    await page.locator('span:text-is("Live tail")').locator('..').remove()
    await page.locator('nav').remove()
  }

  async function setTail(page: Page, tail: string) {
    await page.getByRole('button', { name: tail, exact: true }).click()
    await hideControls(page)
  }

  test(
    'conversation',
    async page => {
      await setTail(page, 'None')
      await takeSnapshot()
    },
    { viewports: PAGE_VIEWPORTS }
  )

  for (const tail of ['Waiting', 'Thinking', 'Text']) {
    test(`live tail: ${tail.toLowerCase()}`, async page => {
      await setTail(page, tail)
      await takeSnapshot()
    })
  }

  test('error banner', async page => {
    await page.getByRole('switch').click()
    await hideControls(page)
    await takeSnapshot()
  })

  test('session menu', async page => {
    await hideControls(page)
    // The menu opens on timers, so the clock runs while it opens, then holds
    // the sport icon again.
    await page.resumeClock()
    await page.getByRole('button', { name: 'Fix the layout save race' }).click()
    await expect(page.getByRole('menu')).toBeVisible()
    await holdSportIcon(page)
    await takeSnapshot()
  })

  test('muted background', async page => {
    await page.getByRole('button', { name: 'Muted', exact: true }).click()
    await setTail(page, 'None')
    await takeSnapshot()
  })
})

describe('Tool calls', () => {
  const card = (page: Page) => page.locator('div.rounded-xl.border.bg-background')

  // Leaves only the tool-call card: the page's label and variant switcher are
  // playground chrome.
  async function showVariant(page: Page, variant: string) {
    await page.goto('/dev/tool-calls')
    await page.getByRole('button', { name: variant, exact: true }).click()
    if (variant === 'Subagent') await holdSportIcon(page)
    await page.locator('span:text-is("Playground / Tool calls")').remove()
    await page.getByRole('button', { name: 'Single', exact: true }).locator('..').remove()
  }

  for (const variant of ['Single', 'Multiple', 'Live', 'Subagent', 'Subagent done']) {
    test(variant, async page => {
      await showVariant(page, variant)
      await takeSnapshot()
    })
  }

  test('Multiple, a row expanded', async page => {
    await showVariant(page, 'Multiple')
    const row = card(page).locator('[aria-expanded]').first()
    await row.click()
    await expect(row).toHaveAttribute('aria-expanded', 'true')
    await takeSnapshot()
  })
})

describe('Dev pages', () => {
  test('textures', async page => {
    await page.goto('/dev/textures')
    await expect(page.getByText('Checker').first()).toBeVisible()
    await takeSnapshot()
  })

  test('collab', async page => {
    await page.goto('/dev/collab')
    await expect(page.getByRole('region', { name: 'Your playground' })).toBeVisible()
    // Each pane scrolls inside a fixed height; show every demo in full.
    await page.addStyleTag({
      content:
        'section[aria-label$="playground"] > .h-96 { height: auto !important; overflow: visible !important; }'
    })
    await takeSnapshot()
  })

  for (const family of ['Boxy', 'Cloud', 'Sun', 'Triangle']) {
    test(`blobatar shapes: ${family.toLowerCase()}`, async page => {
      await page.goto('/dev/blobatar-shapes')
      await expect(page.getByText('Blobatar shape builder')).toBeVisible()
      await page.getByRole('button', { name: family }).first().click()
      await takeSnapshot()
    })
  }
})
