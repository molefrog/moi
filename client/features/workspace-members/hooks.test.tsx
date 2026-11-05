import { afterEach, expect, test } from 'bun:test'
import { act } from 'react'
import { cleanupAccount, mountAccount } from '../account/account-test-utils'
import { useInviteMember, useWorkspaceMembers } from './hooks'
import { setWorkspaceMembers } from './store'
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
      <button onClick={() => invite.mutate({ email: 'tony@example.com' })}>Invite Tony</button>
      <pre data-members>{JSON.stringify(snapshot.data)}</pre>
      <p data-error>{invite.error?.message}</p>
    </>
  )
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
