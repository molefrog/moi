import { afterEach, expect, spyOn, test } from 'bun:test'
import { act } from 'react'
import { Link, Route } from 'wouter'
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
import { YouSettings } from './you-settings'
import { TeamSettings } from './team-settings'
import { SettingsPage } from './settings-page'
import { toast, Toaster } from '@/client/components/ui/toast'

afterEach(cleanupAccount)

type FixtureOptions = AccountFixtureOptions & { mode?: 'team' | 'account' | 'page' }
function mountSettings({ mode = 'team', ...options }: FixtureOptions = {}) {
  return mountAccount({
    ...options,
    children: (
      <Toaster>
        {mode === 'page' ? (
          <SettingsPage />
        ) : (
          <AccountProbe>{mode === 'team' ? <TeamSettings /> : <YouSettings />}</AccountProbe>
        )}
      </Toaster>
    )
  })
}

test('owners can remove members and cancel invitations, and directory follows the response', async () => {
  const ui = await mountSettings()
  await ui.click('Remove ada@example.com')
  expect(ui.calls.some(call => call.body?.memberId === 'member-ada')).toBe(false)
  expect(ui.document.querySelector('[aria-label="Remove ada@example.com"]')).toBeNull()
  await ui.click('Close toast')
  expect(ui.calls.some(call => call.body?.memberId === 'member-ada')).toBe(true)
  expect(ui.document.querySelector('[aria-label="Remove ada@example.com"]')).toBeNull()
  expect(getDirectory()?.map(user => user.id)).toEqual(['me'])
  await ui.click('Cancel invitation for grace@example.com')
  expect(
    ui.document.querySelector('[aria-label="Cancel invitation for grace@example.com"]')
  ).toBeNull()
})

test('Undo restores a member without sending a removal request', async () => {
  const ui = await mountSettings()
  await ui.click('Remove ada@example.com')
  expect(ui.document.querySelector('[aria-label="Remove ada@example.com"]')).toBeNull()
  const callsBeforeUndo = ui.calls.length
  await ui.click('Undo')
  expect(ui.calls).toHaveLength(callsBeforeUndo)
  expect(ui.document.querySelector('[aria-label="Remove ada@example.com"]')).not.toBeNull()
  expect(ui.calls.some(call => call.path.endsWith('/members/remove'))).toBe(false)
  expect(
    getDirectory()
      ?.map(user => user.id)
      .sort()
  ).toEqual(['ada', 'me'])
  expect(ui.document.querySelector<HTMLInputElement>('#invite-email')?.disabled).toBe(false)
})

test('other team actions stay usable while removal waits for Undo', async () => {
  const ui = await mountSettings()
  await ui.click('Remove ada@example.com')
  await ui.click('Cancel invitation for grace@example.com')
  expect(ui.calls.some(call => call.path.endsWith('/cancel'))).toBe(true)
  expect(ui.calls.some(call => call.path.endsWith('/members/remove'))).toBe(false)
  expect(ui.document.querySelector('[aria-label="Remove ada@example.com"]')).toBeNull()
  await ui.click('Undo')
  expect(ui.document.querySelector('[aria-label="Remove ada@example.com"]')).not.toBeNull()
})

test('pending removals survive leaving settings and Undo after returning', async () => {
  const ui = await mountAccount({
    children: (
      <Toaster>
        <Link href="/">Home</Link>
        <Link href="/settings">Settings</Link>
        <Route path="/settings">
          <TeamSettings />
        </Route>
      </Toaster>
    )
  })
  await ui.click('Remove ada@example.com')
  await act(async () => ui.document.querySelector<HTMLAnchorElement>('a[href="/"]')!.click())
  expect(ui.document.querySelector('#invite-email')).toBeNull()
  await act(async () =>
    ui.document.querySelector<HTMLAnchorElement>('a[href="/settings"]')!.click()
  )
  expect(ui.document.querySelector('#invite-email')).not.toBeNull()
  expect(ui.document.querySelector('[aria-label="Remove ada@example.com"]')).toBeNull()
  await ui.click('Undo')
  expect(ui.document.querySelector('[aria-label="Remove ada@example.com"]')).not.toBeNull()
  expect(ui.calls.some(call => call.path.endsWith('/members/remove'))).toBe(false)
})

test('team controls remain disabled until every overlapping request finishes', async () => {
  const ui = await mountSettings({ pendingMutation: true, pendingMutationPaths: ['/invite'] })
  await ui.click('Remove ada@example.com')
  await ui.type(ui.document.querySelector<HTMLInputElement>('#invite-email')!, 'new@example.com')
  await act(async () =>
    ui.document
      .querySelector('form')!
      .dispatchEvent(new ui.window.Event('submit', { bubbles: true, cancelable: true }))
  )
  await ui.settle()
  expect(ui.calls.some(call => call.path.endsWith('/invite'))).toBe(true)
  await ui.click('Close toast')
  expect(getDirectory()?.map(user => user.id)).toEqual(['me'])
  expect(ui.document.querySelector<HTMLInputElement>('#invite-email')?.disabled).toBe(true)
  await act(async () => ui.mutationRequest.resolve())
  await ui.settle()
  expect(ui.document.querySelector<HTMLInputElement>('#invite-email')?.disabled).toBe(false)
})

test('removal commits when the undo toast expires', async () => {
  const ui = await mountSettings()
  await ui.click('Remove ada@example.com')
  expect(ui.calls.some(call => call.path.endsWith('/members/remove'))).toBe(false)
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 5100))
  })
  await ui.settle()
  expect(ui.calls.filter(call => call.path.endsWith('/members/remove'))).toHaveLength(1)
  expect(ui.document.querySelector('[aria-label="Remove ada@example.com"]')).toBeNull()
  expect(getDirectory()?.map(user => user.id)).toEqual(['me'])
}, 10000)

test('a pending removal is cancelled if the account changes', async () => {
  const ui = await mountSettings()
  await ui.click('Remove ada@example.com')
  await act(async () => ui.qc.setQueryData(accountKeys.session, null))
  await ui.click('Close toast')
  expect(ui.calls.some(call => call.path.endsWith('/members/remove'))).toBe(false)
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
  const notification = spyOn(toast, 'add')
  try {
    await ui.click('Remove ada@example.com')
    await ui.click('Close toast')
    expect(ui.document.body.textContent).toContain('Ada')
    expect(notification).toHaveBeenCalledWith({
      title: 'Couldn’t update team',
      description: 'Only the owner can do that.',
      type: 'error'
    })
    expect(ui.document.querySelector('[role="alert"]')).toBeNull()
    ui.failures.mutation = false
    await ui.click('Remove ada@example.com')
    await ui.click('Close toast')
    expect(ui.document.querySelector('[aria-label="Remove ada@example.com"]')).toBeNull()
  } finally {
    notification.mockRestore()
  }
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
  expect(ui.document.querySelector('#you-email')?.getAttribute('readOnly')).toBe('')
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
  const rows = ui.document.querySelectorAll('ul > li')
  const invitation = rows[rows.length - 1]!
  expect(invitation.textContent).toContain('new@example.com')
  expect(invitation.textContent).toContain('Invitation expires')
  expect(invitation.querySelector('button')?.textContent).toBe('')
  await ui.click('Cancel invitation for new@example.com')
  expect(ui.calls.some(call => call.path.endsWith('/invitation/invite-new/cancel'))).toBe(true)
  expect(
    ui.document.querySelector('[aria-label="Cancel invitation for new@example.com"]')
  ).toBeNull()
})

test('local settings show You without Email or Team and respect supplied identity', async () => {
  const ui = await mountSettings({ mode: 'page', environment: 'local' })
  expect([...ui.document.querySelectorAll('h2')].map(heading => heading.textContent)).toEqual([
    'You'
  ])
  expect(ui.document.querySelector('input')?.value).toBe('Alex')
  expect(ui.document.querySelector('input')?.hasAttribute('readOnly')).toBe(true)
  expect(ui.document.querySelector('#you-email')).toBeNull()
  expect(ui.calls).toEqual([])
})

test('registered cloud settings show You, read-only Email, and Team', async () => {
  const ui = await mountSettings({ mode: 'page' })
  expect([...ui.document.querySelectorAll('h2')].map(heading => heading.textContent)).toEqual([
    'You',
    'Team'
  ])
  expect(ui.document.querySelector('#you-email')?.getAttribute('readOnly')).toBe('')
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
  expect(ui.document.querySelector<HTMLInputElement>('#you-email')?.value).toBe('alex@example.com')
})

test('team controls stay disabled until a mutation finishes', async () => {
  const ui = await mountSettings({ pendingMutation: true })
  await ui.click('Remove ada@example.com')
  expect(ui.document.querySelector('[aria-label="Remove ada@example.com"]')).toBeNull()
  expect(ui.document.querySelector<HTMLInputElement>('#invite-email')?.disabled).toBe(false)
  await ui.click('Close toast')
  expect(ui.document.querySelector<HTMLInputElement>('#invite-email')?.disabled).toBe(true)
  await act(async () => ui.mutationRequest.resolve())
  await ui.settle()
  expect(ui.document.querySelector('[aria-label="Remove ada@example.com"]')).toBeNull()
  expect(ui.document.querySelector<HTMLInputElement>('#invite-email')?.disabled).toBe(false)
})

test.each([{ loadingTeam: true }, { failTeam: true }])(
  'session resolves the account without an injected profile or a working team request: %j',
  async options => {
    const ui = await mountSettings({ mode: 'page', injected: false, ...options })
    await ui.settle()
    expect(getCurrentUser()).toMatchObject({ id: 'me', name: 'Alex', email: 'alex@example.com' })
    expect(ui.document.querySelector('input')?.value).toBe('Alex')
    expect(ui.document.querySelector('#you-email')).not.toBeNull()
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
  expect(ui.calls.some(call => call.path.endsWith('/profile'))).toBe(true)
  expect(input.disabled).toBe(false)
  await act(async () => ui.teamResponse.resolve(Response.json(ownerTeam)))
  await ui.settle()
  expect(ui.document.querySelector('[aria-label="Loading team"]') === null).toBe(true)
  expect(ui.document.body.textContent).toContain('Ada')
  expect(input.value).toBe('New name')
})
