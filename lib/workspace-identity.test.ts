import { expect, test } from 'bun:test'
import { remoteFromIdentity, workspaceIdentity } from './workspace-identity'
import { workspaceBase } from './workspace-identity'

test('remote identity is the owner pair, independent of a former reference id', () => {
  const remote = { user_id: 'alice', workspace_id: 'board' }
  const key = workspaceIdentity({ id: 'old-reference', remote })
  expect(key).toBe(workspaceIdentity({ id: 'board', remote }))
  expect(remoteFromIdentity(key)).toEqual(remote)
  expect(workspaceBase(key)).toBe('/api/remote/alice/workspaces/board')
  expect(key).not.toBe(workspaceIdentity({ id: 'board' }))
  expect(key).not.toBe(workspaceIdentity({ id: 'board', remote: { ...remote, user_id: 'bob' } }))
})

test('pair serialization handles delimiters and unicode without collisions', () => {
  for (const remote of [
    { user_id: 'a:b', workspace_id: 'c' },
    { user_id: 'a', workspace_id: 'b:c' },
    { user_id: 'ü~@', workspace_id: '板' }
  ])
    expect(remoteFromIdentity(workspaceIdentity({ id: remote.workspace_id, remote }))).toEqual(
      remote
    )
  expect(remoteFromIdentity('local')).toBeUndefined()
  expect(remoteFromIdentity('remote~invalid')).toBeUndefined()
})
