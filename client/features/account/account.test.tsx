import { afterEach, expect, spyOn, test } from 'bun:test'
import { act } from 'react'
import { toast } from '@/client/components/ui/toast'
import { getCurrentUser, getDirectory } from '@/client/features/collab/host-state'
import { AccountMenu } from './account-menu'
import { accountKeys } from './api'
import { cleanupAccount, mountAccount as mountAccountFixture } from './account-test-utils'
import type { AccountFixtureOptions } from './account-test-utils'

afterEach(cleanupAccount)

type FixtureOptions = AccountFixtureOptions & { mode?: 'menu' }
function mountAccount({ mode, ...options }: FixtureOptions = {}) {
  return mountAccountFixture({ ...options, ...(mode === 'menu' && { children: <AccountMenu /> }) })
}

test('sign-out failure keeps identity; success clears account data and navigates to cloud login', async () => {
  const ui = await mountAccount()
  ui.failures.signOut = true
  await ui.click('Sign out')
  expect(getCurrentUser()?.id).toBe('me')
  expect(ui.navigations).toEqual([])
  expect(ui.document.body.textContent).toContain('Try signing out again.')
  ui.failures.signOut = false
  await ui.click('Sign out')
  expect(getCurrentUser()).toBeUndefined()
  expect(getDirectory()).toEqual([])
  expect(ui.navigations).toEqual(['/cloud/login'])
  expect(ui.qc.getQueryData(accountKeys.session)).toBeNull()
})

test.each([{ anonymous: true }, { signedOut: true }, { demo: true }])(
  'unregistered cloud viewers have no account controls: %j',
  async options => {
    const ui = await mountAccount(options)
    expect(ui.document.querySelector('[data-account-status]')?.textContent).toBe('signed-out')
    expect(ui.document.querySelector('input')).toBeNull()
    expect(ui.document.querySelector('button')).toBeNull()
    expect(ui.calls).toEqual([])
  }
)

test('an account switch uses the new id and drops the previous directory before the team loads', async () => {
  const ui = await mountAccount({ loadingTeam: true })
  await act(async () =>
    ui.qc.setQueryData(accountKeys.session, {
      user: { id: 'other', name: 'Other account', email: 'alex@example.com', isAnonymous: false }
    })
  )
  await ui.settle()
  expect(getCurrentUser()).toMatchObject({ id: 'other', name: 'Other account' })
  expect(getDirectory()?.map(user => user.id)).toEqual(['other'])
  expect(ui.document.querySelector('[data-account-status]')?.textContent).toBe('ready')
})

test.each([{ demo: true }, { anonymous: true }, { signedOut: true }, { failSession: true }])(
  'account menu is absent when unavailable: %j',
  async options => {
    const ui = await mountAccount({ mode: 'menu', ...options })
    await ui.settle()
    expect(ui.document.querySelector('button')).toBeNull()
    expect(ui.document.body.textContent).toBe('')
  }
)

test('account menu displays its loading state', async () => {
  const ui = await mountAccount({ mode: 'menu', loadingSession: true })
  expect(ui.document.querySelector('[aria-label="Loading account"]')).not.toBeNull()
  expect(ui.document.querySelector('button')).toBeNull()
})

test('local menu opens with identity, feedback, and settings but no sign-out', async () => {
  const ui = await mountAccount({ mode: 'menu', environment: 'local' })
  await ui.click('User menu')
  expect(ui.document.body.textContent).toContain('Alex')
  expect(ui.document.body.textContent).toContain('This computer')
  expect(ui.document.querySelector('a[href="/settings"]')?.textContent).toContain('Settings')
  expect(ui.document.querySelector('a[target="_blank"]')?.textContent).toContain('Leave feedback')
  expect(ui.document.body.textContent).not.toContain('Sign out')
  await act(async () => ui.location.navigate('/'))
  await ui.click('Settings')
  expect(ui.location.history.at(-1)).toBe('/settings')
})

test('cloud menu opens with email and signs out through the real control', async () => {
  const ui = await mountAccount({ mode: 'menu' })
  await ui.click('User menu')
  expect(ui.document.body.textContent).toContain('alex@example.com')
  await ui.click('Sign out')
  expect(ui.navigations).toEqual(['/cloud/login'])
})

test('menu sign-out failure keeps the account and reports the error', async () => {
  const ui = await mountAccount({ mode: 'menu' })
  ui.failures.signOut = true
  const notification = spyOn(toast, 'add')
  try {
    await ui.click('User menu')
    await ui.click('Sign out')
    expect(ui.navigations).toEqual([])
    expect(getCurrentUser()?.id).toBe('me')
    expect(notification).toHaveBeenCalledWith({
      title: 'Couldn’t sign out',
      description: 'Try signing out again.',
      type: 'error'
    })
    expect(ui.document.querySelector('[aria-label="User menu"]')).not.toBeNull()
  } finally {
    notification.mockRestore()
  }
})

test('injected identity remains the snapshot while session is loading', async () => {
  const ui = await mountAccount({ loadingSession: true })
  expect(getCurrentUser()).toMatchObject({
    id: 'me',
    color: 'blue',
    avatar: 'https://example.com/avatar.png'
  })
  expect(getDirectory()?.map(user => user.id)).toEqual(['me', 'ada'])
  expect(ui.document.querySelector('[data-account-status]')?.textContent).toBe('loading')
})

test('session refresh matches the injected profile by id even when its email changes', async () => {
  const ui = await mountAccount({ loadingTeam: true })
  await act(async () =>
    ui.qc.setQueryData(accountKeys.session, {
      user: { id: 'me', name: 'Updated name', email: 'new@example.com', isAnonymous: false }
    })
  )
  await ui.settle()
  expect(getCurrentUser()).toMatchObject({
    id: 'me',
    name: 'Updated name',
    email: 'new@example.com',
    color: 'blue',
    avatar: 'https://example.com/avatar.png'
  })
  expect(
    getDirectory()
      ?.map(user => user.id)
      .sort()
  ).toEqual(['ada', 'me'])
  expect(ui.document.querySelector('[data-account-status]')?.textContent).toBe('ready')
})
