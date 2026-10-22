import { afterEach, expect, test } from 'bun:test'
import { act } from 'react'
import { getCurrentUser, getDirectory } from '@/client/features/collab/host-state'
import { accountKeys } from '../account/api'
import type { CloudSession } from '../account/api'
import {
  AccountProbe,
  cleanupAccount,
  mountAccount,
  ownerTeam
} from '../account/account-test-utils'
import type { AccountFixtureOptions } from '../account/account-test-utils'
import { AccountSettings } from './account-settings'
import { TeamSettings } from './team-settings'
import { SettingsPage } from './settings-page'

afterEach(cleanupAccount)

type FixtureOptions = AccountFixtureOptions & { mode?: 'team' | 'account' | 'page' }
function mountSettings({ mode = 'team', ...options }: FixtureOptions = {}) {
  return mountAccount({
    ...options,
    children:
      mode === 'page' ? (
        <SettingsPage />
      ) : (
        <AccountProbe>{mode === 'team' ? <TeamSettings /> : <AccountSettings />}</AccountProbe>
      )
  })
}

test('owners can remove members and cancel invitations, and directory follows the response', async () => {
  const ui = await mountSettings()
  await ui.click('Remove ada@example.com')
  expect(ui.calls.some(call => call.body?.memberId === 'member-ada')).toBe(true)
  expect(ui.document.body.textContent).not.toContain('Ada')
  expect(getDirectory()?.map(user => user.id)).toEqual(['me'])
  await ui.click('Cancel invitation for grace@example.com')
  expect(
    ui.document.querySelector('[aria-label="Cancel invitation for grace@example.com"]')
  ).toBeNull()
})

test('members can see the team but have no management controls', async () => {
  const ui = await mountSettings({ role: 'admin' })
  expect(ui.document.body.textContent).toContain('Ada')
  expect(ui.document.querySelector('form')).toBeNull()
  expect(ui.document.querySelector('[aria-label^="Remove"]')).toBeNull()
  expect(ui.document.querySelector('[aria-label^="Cancel"]')).toBeNull()
})

test('failed team mutations retain the list and report the server error', async () => {
  const ui = await mountSettings()
  ui.failures.mutation = true
  await ui.click('Remove ada@example.com')
  expect(ui.document.body.textContent).toContain('Ada')
  expect(ui.document.querySelector('[role="alert"]')?.textContent).toBe(
    'Only the owner can do that.'
  )
})

test('team errors can be retried', async () => {
  const ui = await mountSettings({ failTeam: true })
  await ui.settle()
  expect(ui.document.body.textContent).toContain('Team unavailable')
  ui.failures.team = false
  await ui.click('Try again')
  expect(ui.document.body.textContent).toContain('Ada')
})

test('cloud name saves update the account and preserve avatar and color', async () => {
  const ui = await mountSettings({ mode: 'account' })
  const input = ui.document.querySelector('input')!
  await ui.type(input, 'New name')
  await act(async () => input.dispatchEvent(new ui.window.Event('focusout', { bubbles: true })))
  await ui.settle()
  expect(getCurrentUser()).toMatchObject({
    id: 'me',
    name: 'New name',
    color: 'blue',
    avatar: 'https://example.com/avatar.png'
  })
  expect(ui.document.querySelector('[data-account-name]')?.textContent).toBe('New name')
  expect(ui.document.querySelector('#account-email')?.getAttribute('readOnly')).toBe('')
})

test('inviting a teammate sends the trimmed email and refreshes invitations', async () => {
  const ui = await mountSettings()
  const input = ui.document.querySelector<HTMLInputElement>('#invite-email')!
  await ui.type(input, '  new@example.com  ')
  await act(async () =>
    ui.document
      .querySelector('form')!
      .dispatchEvent(new ui.window.Event('submit', { bubbles: true, cancelable: true }))
  )
  await ui.settle()
  expect(ui.calls.find(call => call.path.endsWith('/invite'))?.body).toEqual({
    email: 'new@example.com'
  })
  expect(ui.document.body.textContent).toContain('new@example.com')
  expect(input.value).toBe('')
})

test('local settings show Account without Email or Team and respect supplied identity', async () => {
  const ui = await mountSettings({ mode: 'page', environment: 'local' })
  expect([...ui.document.querySelectorAll('h2')].map(heading => heading.textContent)).toEqual([
    'Account'
  ])
  expect(ui.document.querySelector('input')?.value).toBe('Alex')
  expect(ui.document.querySelector('input')?.hasAttribute('readOnly')).toBe(true)
  expect(ui.document.querySelector('#account-email')).toBeNull()
  expect(ui.calls).toEqual([])
})

test('registered cloud settings show Account, read-only Email, and Team', async () => {
  const ui = await mountSettings({ mode: 'page' })
  expect([...ui.document.querySelectorAll('h2')].map(heading => heading.textContent)).toEqual([
    'Account',
    'Team'
  ])
  expect(ui.document.querySelector('#account-email')?.getAttribute('readOnly')).toBe('')
  expect(ui.document.querySelector('input')?.hasAttribute('readOnly')).toBe(false)
  expect(ui.document.body.textContent).toContain('Ada')
})

test.each([{ demo: true }, { anonymous: true }])(
  'demo settings redirect home: %j',
  async options => {
    const ui = await mountSettings({ mode: 'page', ...options })
    expect(ui.location.history).toEqual(['/'])
    expect(ui.document.querySelector('input')).toBeNull()
    expect(ui.navigations).toEqual([])
  }
)

test('signed-out cloud settings navigate to cloud login', async () => {
  const ui = await mountSettings({ mode: 'page', signedOut: true })
  expect(ui.navigations).toEqual(['/cloud/login'])
  expect(ui.document.querySelector('input')).toBeNull()
})

test('settings display session loading without exposing fields', async () => {
  const ui = await mountSettings({ mode: 'page', loadingSession: true })
  expect(ui.document.querySelector('[aria-label="Loading settings"]')).not.toBeNull()
  expect(ui.document.querySelector('input')).toBeNull()
  expect(ui.navigations).toEqual([])
})

test('settings session errors offer a working retry', async () => {
  const ui = await mountSettings({ mode: 'page', failSession: true })
  await ui.settle()
  expect(ui.document.querySelector('[role="alert"]')?.textContent).toContain('Couldn’t load')
  expect(ui.document.querySelector('input')).toBeNull()
  ui.failures.session = false
  await ui.click('Try again')
  expect(ui.document.querySelector<HTMLInputElement>('#account-email')?.value).toBe(
    'alex@example.com'
  )
})

test('team controls stay disabled until a mutation finishes', async () => {
  const ui = await mountSettings({ pendingMutation: true })
  await ui.click('Remove ada@example.com')
  const remove = ui.document.querySelector<HTMLButtonElement>(
    '[aria-label="Remove ada@example.com"]'
  )!
  expect(remove.disabled).toBe(true)
  expect(remove.textContent).toBe('Removing…')
  expect(ui.document.querySelector<HTMLInputElement>('#invite-email')?.disabled).toBe(true)
  await act(async () => ui.mutationRequest.resolve())
  await ui.settle()
  expect(ui.document.body.textContent).not.toContain('Ada')
  expect(ui.document.querySelector<HTMLInputElement>('#invite-email')?.disabled).toBe(false)
})

test.each([{ loadingTeam: true }, { failTeam: true }])(
  'session resolves the account without an injected profile or a working team request: %j',
  async options => {
    const ui = await mountSettings({ mode: 'page', injected: false, ...options })
    await ui.settle()
    expect(getCurrentUser()).toMatchObject({ id: 'me', name: 'Alex', email: 'alex@example.com' })
    expect(ui.document.querySelector('input')?.value).toBe('Alex')
    expect(ui.document.querySelector('#account-email')).not.toBeNull()
    expect(ui.document.body.textContent).not.toContain('Couldn’t load your account.')
    if (options.loadingTeam)
      expect(ui.document.querySelector('[aria-label="Loading team"]')).not.toBeNull()
    else expect(ui.document.body.textContent).toContain('Team unavailable')
  }
)

test('a name response cannot overwrite an account that changed id while saving', async () => {
  const ui = await mountSettings({ mode: 'account', pendingMutation: true, loadingTeam: true })
  const input = ui.document.querySelector('input')!
  await ui.type(input, 'Old account update')
  await act(async () => input.dispatchEvent(new ui.window.Event('focusout', { bubbles: true })))
  await ui.settle()
  expect(ui.calls.some(call => call.path.endsWith('/profile'))).toBe(true)
  await act(async () =>
    ui.qc.setQueryData(accountKeys.session, {
      user: { id: 'other', name: 'Other account', email: 'alex@example.com', isAnonymous: false }
    })
  )
  await act(async () => ui.mutationRequest.resolve())
  await ui.settle()
  expect(getCurrentUser()).toMatchObject({ id: 'other', name: 'Other account' })
  expect(ui.qc.getQueryData<CloudSession>(accountKeys.session)?.user.id).toBe('other')
})

test('a failed name save leaves the pending team request able to finish', async () => {
  const ui = await mountSettings({ mode: 'page', loadingTeam: true })
  ui.failures.mutation = true
  expect(ui.document.querySelector('[aria-label="Loading team"]')).not.toBeNull()
  const input = ui.document.querySelector('input')!
  await ui.type(input, 'New name')
  await act(async () => input.dispatchEvent(new ui.window.Event('focusout', { bubbles: true })))
  await ui.settle()
  expect(ui.document.body.textContent).toContain('Only the owner can do that.')
  await act(async () => ui.teamResponse.resolve(Response.json(ownerTeam)))
  await ui.settle()
  expect(ui.document.querySelector('[aria-label="Loading team"]') === null).toBe(true)
  expect(ui.document.body.textContent).toContain('Ada')
  expect(input.value).toBe('New name')
})
