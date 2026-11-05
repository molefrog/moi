import { expect } from '@uiverify/bun'

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
