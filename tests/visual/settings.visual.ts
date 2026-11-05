import { expect } from '@uiverify/bun'

import { suite, WORKSPACE } from './fixtures'

const { describe, test } = suite(import.meta.path)

describe('Settings', () => {
  test('app', async page => {
    await page.goto('/#/settings')
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  })

  for (const section of ['General', 'Connectors', 'Environment']) {
    test(`workspace, ${section.toLowerCase()}`, async page => {
      await page.goto(`/#/workspace/${WORKSPACE}`)
      await page.getByRole('button', { name: 'Settings' }).click()
      await page.getByRole('button', { name: section }).click()
      await expect(page.getByRole('heading', { name: section })).toBeVisible()
    })
  }
})
