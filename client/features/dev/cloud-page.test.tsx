import { afterEach, expect, test } from 'bun:test'
import { act } from 'react'
import { cleanupAccount, mountAccount } from '../account/account-test-utils'
import { setWorkspaceMembers } from '../workspace-members/store'
import { CloudPage } from './cloud-page'

afterEach(cleanupAccount)
const owner = {
  id: 'me',
  type: 'user',
  name: 'Alex',
  email: 'alex@example.com',
  isAnonymous: false,
  avatar: 'https://example.com/alex.png'
} as const
const tony = {
  id: 'tony',
  type: 'user',
  name: 'Tony',
  email: 'tony@example.com',
  isAnonymous: false,
  membershipId: 'member-tony'
} as const

test('sharing shows workspace names, member profiles and owner without developer data', async () => {
  const ui = await mountAccount({ children: <CloudPage /> })
  await ui.settle()
  ui.setMembership({ members: [owner, tony], invitations: [] })
  await act(async () => setWorkspaceMembers('one', { members: [owner, tony], invitations: [] }))
  await ui.settle()
  expect(ui.document.querySelector('[role="combobox"]')?.textContent).toContain('First workspace')
  expect(ui.document.body.textContent).toContain('Alex (you)')
  expect(ui.document.body.textContent).toContain('Owner')
  expect(ui.document.body.textContent).toContain('Tony')
  expect(ui.document.querySelector('[aria-label="Alex"]')).not.toBeNull()
  expect(ui.document.querySelector('pre')).toBeNull()
  expect(ui.document.body.textContent).not.toContain('member-tony')
  expect(
    [...ui.document.querySelectorAll('button')].filter(button => button.textContent === 'Remove')
  ).toHaveLength(1)
})

test('a failed invite keeps the email available for retry and success clears it', async () => {
  const ui = await mountAccount({ children: <CloudPage /> })
  await ui.settle()
  const input = ui.document.querySelector<HTMLInputElement>('[aria-label="Email address"]')!
  await ui.type(input, 'tony@example.com')
  ui.failures.mutation = true
  await act(async () => {
    ui.document
      .querySelector('form')!
      .dispatchEvent(new ui.window.Event('submit', { bubbles: true, cancelable: true }))
  })
  await ui.settle()
  expect(input.value).toBe('tony@example.com')
  expect(ui.document.body.textContent).toContain('Only the owner')
  ui.failures.mutation = false
  await act(async () => {
    ui.document
      .querySelector('form')!
      .dispatchEvent(new ui.window.Event('submit', { bubbles: true, cancelable: true }))
  })
  await ui.settle()
  await ui.settle()
  expect(input.value).toBe('')
  expect(ui.document.body.textContent).toContain('Invitation sent to tony@example.com')
  expect(ui.document.body.textContent).toContain('Pending invitations')
})

test('removing someone requires confirming their name and preserves the owner', async () => {
  const ui = await mountAccount({ children: <CloudPage /> })
  await ui.settle()
  const data = { members: [owner, tony], invitations: [] }
  ui.setMembership(data)
  await act(async () => setWorkspaceMembers('one', data))
  await ui.settle()
  await ui.click('Remove')
  expect(ui.document.body.textContent).toContain('Remove Tony?')
  expect(ui.calls.some(call => call.path.endsWith('/members/member-tony'))).toBe(false)
  await ui.click('Cancel')
  expect(ui.calls.some(call => call.path.endsWith('/members/member-tony'))).toBe(false)
  await ui.click('Remove')
  await ui.click('Remove member')
  await ui.settle()
  expect(ui.calls.some(call => call.path.endsWith('/members/member-tony'))).toBe(true)
  expect(ui.document.body.textContent).not.toContain('tony@example.com')
  expect(ui.document.body.textContent).toContain('Alex (you)')
})

test('revoking an invitation names the recipient and removes the pending invitation', async () => {
  const ui = await mountAccount({ children: <CloudPage /> })
  await ui.settle()
  const data = {
    members: [owner],
    invitations: [
      { id: 'pending-tony', email: 'tony@example.com', expiresAt: '2030-01-01T00:00:00Z' }
    ]
  }
  ui.setMembership(data)
  await act(async () => setWorkspaceMembers('one', data))
  await ui.settle()
  await ui.click('Revoke')
  expect(ui.document.body.textContent).toContain(
    'The invitation for tony@example.com will no longer work'
  )
  expect(ui.calls.some(call => call.path.endsWith('/invitations/pending-tony'))).toBe(false)
  await ui.click('Revoke invitation')
  await ui.settle()
  expect(ui.calls.some(call => call.path.endsWith('/invitations/pending-tony'))).toBe(true)
  expect(ui.document.body.textContent).not.toContain('tony@example.com')
})
