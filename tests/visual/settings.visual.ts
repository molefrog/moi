import { expect, takeSnapshot } from '@uiverify/bun'

import { suite, WORKSPACE } from './fixtures'

const { describe, test } = suite(import.meta.path)

describe('Settings', () => {
  test('app', async page => {
    await page.goto('/#/settings')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  })

  test(
    'cloud profile',
    async page => {
      await page.goto('/#/settings')
      await expect(page.getByRole('button', { name: 'Change your avatar' })).toBeVisible()
      await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toHaveValue(
        'alex@example.com'
      )
      await takeSnapshot('profile avatar')
      await page.getByRole('button', { name: 'Change your avatar' }).hover()
      await expect(page.locator('[data-slot="tooltip-content"]')).not.toBeVisible()
      await takeSnapshot('change avatar hover')
    },
    {
      api: {
        '/api/config': { environment: 'cloud', demo: false, demoInstallUrl: '/' },
        '/cloud/api/me': {
          id: 'alex',
          type: 'user',
          name: 'Alex',
          email: 'alex@example.com',
          isAnonymous: false
        }
      }
    }
  )

  for (const section of ['General', 'Connectors', 'Environment']) {
    test(`workspace, ${section.toLowerCase()}`, async page => {
      await page.goto(`/#/workspace/${WORKSPACE}`)
      await page.getByRole('button', { name: 'Settings' }).click()
      await page.getByRole('button', { name: section }).click()
      await expect(page.getByRole('heading', { name: section })).toBeVisible()
    })
  }
})
