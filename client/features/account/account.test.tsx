import { afterEach, expect, test } from 'bun:test'
import { act } from 'react'
import { getCurrentUser } from '../collab/host-state'
import { setIdentity } from '../identity/store'
import { AccountMenu } from './account-menu'
import { cleanupAccount, mountAccount } from './account-test-utils'
afterEach(cleanupAccount)
test('signout clears identity and navigates only on success', async () => {
  const ui = await mountAccount()
  ui.failures.signOut = true
  await ui.click('Sign out')
  expect(getCurrentUser()?.id).toBe('me')
  expect(ui.navigations).toEqual([])
  ui.failures.signOut = false
  await ui.click('Sign out')
  expect(getCurrentUser()).toBeUndefined()

  expect(ui.navigations).toEqual(['/cloud/login'])
})
test('account updates from a host push and never requests organization users', async () => {
  const ui = await mountAccount()
  await act(async () =>
    setIdentity({
      id: 'other',
      type: 'user',
      name: 'Other',
      email: 'other@example.com',
      isAnonymous: false
    })
  )
  expect(ui.document.querySelector('[data-account-name]')?.textContent).toBe('Other')
  expect(ui.calls.some(call => call.path.includes('organization'))).toBe(false)
})
test('local account menu retains inherited identity and no signout', async () => {
  const ui = await mountAccount({ environment: 'local', children: <AccountMenu /> })
  await ui.click('User menu')
  expect(ui.document.body.textContent).toContain('Alex')
  expect(ui.document.body.textContent).toContain('This computer')
  expect(ui.document.body.textContent).not.toContain('Sign out')
  expect(ui.calls).toEqual([])
})
test.each([{ signedOut: true }, { anonymous: true }, { demo: true }])(
  'unregistered viewer hides account controls %j',
  async options => {
    const ui = await mountAccount({ ...options, children: <AccountMenu /> })
    expect(ui.document.querySelector('button')).toBeNull()
  }
)
