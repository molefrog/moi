import { afterEach, expect, test } from 'bun:test'
import { act } from 'react'
import { cleanupAccount, mountAccount } from '../account/account-test-utils'
import { useInviteMember, useWorkspaceMembers } from './hooks'
import {
  clearWorkspaceMembers,
  removeWorkspaceMembers,
  setAllWorkspaceMembers,
  setWorkspaceMembers
} from './store'

import { workspaceKeys } from '@/client/api/workspace-keys'
import { setIdentity } from '../identity/store'
const me = {
  id: 'me',
  type: 'user',
  name: 'Alex',
  email: 'alex@example.com',
  isAnonymous: false
} as const
const tony = {
  id: 'tony',
  type: 'user',
  name: 'Tony',
  email: 'tony@example.com',
  isAnonymous: false
} as const
afterEach(cleanupAccount)
function Probe() {
  const snapshot = useWorkspaceMembers('one')
  const invite = useInviteMember('one')
  return (
    <>
      <button onClick={() => invite.mutate({ email: ' Tony@Example.COM ' })}>Invite Tony</button>
      <button onClick={() => void invite.mutateAsync({ email: ' Tony@Example.COM ' })}>
        Invite Tony asynchronously
      </button>
      <pre data-members>{JSON.stringify(snapshot.data)}</pre>
      <p data-error>{invite.error?.message}</p>
    </>
  )
}
for (const button of ['Invite Tony', 'Invite Tony asynchronously']) {
  test(`${button} normalizes the email before sending`, async () => {
    const ui = await mountAccount({ children: <Probe /> })
    await ui.settle()
    await ui.click(button)
    expect(ui.calls.filter(call => call.path.endsWith('/invitations'))).toEqual([
      {
        path: '/cloud/api/workspaces/one/invitations',
        body: { email: 'tony@example.com', workspaceName: 'First workspace' }
      }
    ])
    expect(ui.document.querySelector('[data-members]')?.textContent).toContain('tony@example.com')
  })
}
test('failed optimistic invite disappears without losing a concurrent membership push', async () => {
  const ui = await mountAccount({
    children: <Probe />,
    pendingMutation: true,
    pendingMutationPaths: ['/invitations']
  })
  await ui.settle()
  await ui.click('Invite Tony')
  expect(ui.document.querySelector('[data-members]')?.textContent).toContain('pending:')
  await act(async () => setWorkspaceMembers('one', { members: [me, tony], invitations: [] }))
  ui.failures.mutation = true
  await act(async () => ui.mutationRequest.resolve())
  await ui.settle()
  const rendered = ui.document.querySelector('[data-members]')?.textContent
  expect(rendered).toContain('Tony')
  expect(rendered).not.toContain('pending:')
  expect(ui.document.querySelector('[data-error]')?.textContent).toContain('Only the owner')
})
test('an old account invite completion cannot publish membership into the new account', async () => {
  const ui = await mountAccount({
    children: <Probe />,
    pendingMutation: true,
    pendingMutationPaths: ['/invitations']
  })
  await ui.settle()
  await ui.click('Invite Tony')
  await act(async () => setIdentity({ ...me, id: 'next' }))
  ui.setMembership({ members: [{ ...me, id: 'next' }], invitations: [] })
  await act(async () => ui.mutationRequest.resolve())
  await ui.settle()
  expect(ui.document.querySelector('[data-members]')?.textContent).not.toContain('pending:')
})

test.each([
  ['full snapshot', () => setAllWorkspaceMembers([])],
  ['single removal', () => removeWorkspaceMembers('one')],
  ['clear', clearWorkspaceMembers]
] as const)('%s removes old members from an already mounted view', async (_label, remove) => {
  const ui = await mountAccount({ children: <Probe /> })
  await ui.settle()
  await act(async () =>
    setAllWorkspaceMembers([{ id: 'one', members: [me, tony], invitations: [] }])
  )
  await ui.settle()
  expect(ui.document.querySelector('[data-members]')?.textContent).toContain('Tony')
  await act(async () => remove())
  await ui.settle()
  expect(ui.document.querySelector('[data-members]')?.textContent).not.toContain('Tony')
  expect(ui.document.querySelector('[data-members]')?.textContent).toContain('Alex')
})

for (const name of ['Weekly Review', '', '   ']) {
  test(`invitations send the workspace display name with an ID fallback for ${JSON.stringify(name)}`, async () => {
    const ui = await mountAccount({ children: <Probe /> })
    await ui.settle()
    await act(async () => {
      ui.qc.setQueryData(workspaceKeys.all, [{ id: 'one', name }])
    })
    await ui.settle()
    await ui.click('Invite Tony')
    expect(ui.calls.find(call => call.path.endsWith('/invitations'))).toEqual({
      path: '/cloud/api/workspaces/one/invitations',
      body: name.trim()
        ? { email: 'tony@example.com', workspaceName: 'Weekly Review' }
        : { email: 'tony@example.com' }
    })
  })
}
