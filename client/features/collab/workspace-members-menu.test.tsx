import { toast } from '@/client/components/ui/toast'
import { afterEach, expect, test, spyOn } from 'bun:test'
import { act } from 'react'
import { cleanupAccount, mountAccount } from '../account/account-test-utils'
import { setWorkspaceMembers } from '../workspace-members/store'
import { CollabProvider } from './provider'
import { WorkspaceUsersMenu } from './workspace-users-menu'

afterEach(cleanupAccount)

test('disabled presence loads workspace members and reflects membership updates', async () => {
  const ui = await mountAccount({
    children: (
      <CollabProvider workspaceId="one" enabled={false}>
        <WorkspaceUsersMenu workspaceId="one" describeTab={() => null} onOpenTab={() => {}} />
      </CollabProvider>
    )
  })
  await ui.settle()
  expect(ui.calls.some(call => call.path.endsWith('/workspaces/one/members'))).toBe(true)
  await ui.click('Users in this workspace')
  expect(ui.document.body.textContent).toContain('Alex')
  expect(ui.document.body.textContent).toContain('Invite your agent')
  const copyPrompt = [...ui.document.querySelectorAll<HTMLButtonElement>('button')].find(
    button => button.textContent?.trim() === 'Copy prompt'
  )
  expect(copyPrompt?.disabled).toBe(true)
  expect(ui.document.body.textContent).toContain('Agent invitations aren’t available yet')

  const tony = {
    id: 'tony',
    type: 'user',
    name: 'Tony',
    email: 'tony@example.com',
    isAnonymous: false
  } as const
  await act(async () => setWorkspaceMembers('one', { members: [tony], invitations: [] }))
  await ui.settle()
  expect(ui.document.body.textContent).toContain('Tony')
  await act(async () => setWorkspaceMembers('one', { members: [], invitations: [] }))
  await ui.settle()
  expect(ui.document.body.textContent).not.toContain('Tony')
  expect(ui.document.body.textContent).toContain('No workspace users to show')
  expect(ui.document.querySelector('[aria-label="Users in this workspace"]')).not.toBeNull()
})

test('invitation uses the cloud API, shows a toast and pending participant, and supports retry', async () => {
  const notification = spyOn(toast, 'add')
  try {
    const ui = await mountAccount({
      children: (
        <CollabProvider workspaceId="one" enabled={false}>
          <WorkspaceUsersMenu workspaceId="one" describeTab={() => null} onOpenTab={() => {}} />
        </CollabProvider>
      )
    })
    await ui.settle()
    await ui.click('Users in this workspace')
    const input = ui.document.querySelector<HTMLInputElement>('[aria-label="Email address"]')!
    await ui.type(input, 'Tony@Example.com')
    const submit = async () => {
      await act(async () => {
        ui.document
          .querySelector('form')!
          .dispatchEvent(new ui.window.Event('submit', { bubbles: true, cancelable: true }))
      })
      await ui.settle()
    }
    ui.failures.mutation = true
    await submit()
    expect(input.value).toBe('Tony@Example.com')
    expect(notification).toHaveBeenCalledWith({
      title: 'Couldn’t send invitation',
      description: 'Only the owner can do that.',
      type: 'error'
    })
    expect(ui.document.querySelector('[aria-label="Participants"]')?.textContent).not.toContain(
      'Invited'
    )
    ui.failures.mutation = false
    await submit()
    expect(ui.calls).toContainEqual({
      path: '/cloud/api/workspaces/one/invitations',
      body: { email: 'tony@example.com' }
    })
    expect(input.value).toBe('')
    expect(notification).toHaveBeenCalledWith({
      title: 'Invitation sent',
      description: 'Sent to tony@example.com',
      type: 'success'
    })
    expect(ui.document.querySelector('[aria-label="Participants"]')?.textContent).toContain(
      'tony@example.com'
    )
    expect(ui.document.querySelector('[aria-label="Participants"]')?.textContent).toContain(
      'Invited'
    )
  } finally {
    notification.mockRestore()
  }
})

test('one participant list removes members, revokes invitations and restores failed removals', async () => {
  const notification = spyOn(toast, 'add')
  try {
    const ui = await mountAccount({
      children: (
        <CollabProvider workspaceId="one" enabled={false}>
          <WorkspaceUsersMenu workspaceId="one" describeTab={() => null} onOpenTab={() => {}} />
        </CollabProvider>
      )
    })
    await ui.settle()
    const data = {
      members: [
        { id: 'me', type: 'user', name: 'Alex', email: 'alex@example.com', isAnonymous: false },
        {
          id: 'tony',
          type: 'user',
          name: 'Tony',
          email: 'tony@example.com',
          isAnonymous: false,
          membershipId: 'member-tony'
        }
      ],
      invitations: [
        { id: 'invite-sam', email: 'sam@example.com', expiresAt: '2030-01-01T00:00:00Z' }
      ]
    } as const
    const snapshot = { members: [...data.members], invitations: [...data.invitations] }
    ui.setMembership(snapshot)
    await act(async () => setWorkspaceMembers('one', snapshot))
    await ui.click('Users in this workspace')
    const list = ui.document.querySelector('[aria-label="Participants"]')!
    expect(list.querySelectorAll('li')).toHaveLength(3)
    expect(list.textContent).toContain('Tony')
    expect(list.textContent).toContain('sam@example.com')
    expect(ui.document.querySelector('[aria-label="Remove Alex"]')).toBeNull()
    ui.failures.mutation = true
    await ui.click('Remove Tony')
    expect(list.textContent).toContain('Tony')
    expect(notification).toHaveBeenCalledWith({
      title: 'Couldn’t remove member',
      description: 'Only the owner can do that.',
      type: 'error'
    })
    ui.failures.mutation = false
    await ui.click('Remove Tony')
    expect(ui.calls.some(call => call.path.endsWith('/members/member-tony'))).toBe(true)
    expect(list.textContent).not.toContain('Tony')
    expect(list.textContent).toContain('sam@example.com')
    await ui.click('Revoke invitation for sam@example.com')
    expect(ui.calls.some(call => call.path.endsWith('/invitations/invite-sam'))).toBe(true)
    expect(list.textContent).not.toContain('sam@example.com')
    expect(list.textContent).toContain('Alex')
  } finally {
    notification.mockRestore()
  }
})
