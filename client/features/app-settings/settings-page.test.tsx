import { afterEach, expect, test } from 'bun:test'
import { act } from 'react'
import { getCurrentUser } from '../collab/host-state'
import { setIdentity } from '../identity/store'
import { cleanupAccount, mountAccount } from '../account/account-test-utils'
import { useWorkspaceMembers } from '../collab/members/hooks'
import { useAccount } from '../account/account-provider'
import { SettingsPage } from './settings-page'
afterEach(cleanupAccount)
test('settings retain profile and general settings without organization user controls', async () => {
  const ui = await mountAccount({ children: <SettingsPage /> })
  expect([...ui.document.querySelectorAll('h2')].map(element => element.textContent)).toEqual([
    'Profile',
    'General'
  ])
  expect(ui.document.querySelector<HTMLInputElement>('#profile-email')?.value).toBe(
    'alex@example.com'
  )
  expect(ui.document.querySelector('#invite-email')).toBeNull()
  expect(ui.calls.some(call => call.path.includes('organization'))).toBe(false)
})
test('name saves preserve avatar and update the visible identity', async () => {
  const ui = await mountAccount({ children: <SettingsPage /> })
  const input = ui.document.querySelector('input')!
  await ui.type(input, 'New name')
  await act(async () => input.dispatchEvent(new ui.window.Event('focusout', { bubbles: true })))
  await ui.settle()
  expect(getCurrentUser()).toMatchObject({
    name: 'New name',
    avatar: 'https://example.com/avatar.png'
  })
})
test('a delayed name save cannot restore a previous account', async () => {
  const ui = await mountAccount({ pendingMutation: true, children: <SettingsPage /> })
  const input = ui.document.querySelector('input')!
  await ui.type(input, 'Old response')
  await act(async () => input.dispatchEvent(new ui.window.Event('focusout', { bubbles: true })))
  await act(async () =>
    setIdentity({
      id: 'other',
      type: 'user',
      name: 'Other',
      email: 'other@example.com',
      isAnonymous: false
    })
  )
  await act(async () => ui.mutationRequest.resolve())
  await ui.settle()
  expect(getCurrentUser()).toMatchObject({ id: 'other', name: 'Other' })
})
test('local settings keep profile readonly and cloud email hidden', async () => {
  const ui = await mountAccount({ environment: 'local', children: <SettingsPage /> })
  expect(ui.document.querySelector('#profile-email')).toBeNull()
  expect(ui.document.querySelector('input')?.hasAttribute('readOnly')).toBe(true)
  expect(ui.calls).toEqual([])
})
test('signed-out settings navigate to cloud login', async () => {
  const ui = await mountAccount({ signedOut: true, children: <SettingsPage /> })
  expect(ui.navigations).toEqual(['/cloud/login'])
})

function MembershipProfileProbe() {
  const snapshot = useWorkspaceMembers('one')
  const account = useAccount()
  return (
    <>
      <output data-owner>{JSON.stringify(snapshot.members?.[0])}</output>
      <button onClick={() => void account.saveAvatar(new File(['test'], 'avatar.png'))}>
        Change avatar
      </button>
    </>
  )
}
test('profile saves refresh the active workspace owner row without waiting for a cloud event', async () => {
  const ui = await mountAccount({
    children: (
      <>
        <SettingsPage />
        <MembershipProfileProbe />
      </>
    )
  })
  await ui.settle()
  const input = ui.document.querySelector('input')!
  await ui.type(input, 'Renamed owner')
  await act(async () => input.dispatchEvent(new ui.window.Event('focusout', { bubbles: true })))
  await ui.settle()
  expect(ui.document.querySelector('[data-owner]')?.textContent).toContain('Renamed owner')
  await ui.click('Change avatar')
  expect(ui.document.querySelector('[data-owner]')?.textContent).toContain(
    'https://example.com/new.png'
  )
})
