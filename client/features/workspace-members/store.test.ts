import { afterEach, expect, test } from 'bun:test'
import { queryClient } from '@/client/api/query-client'
import { setIdentity, getIdentity } from '../identity/store'
import { getCurrentUser } from '../collab/host-state'
import {
  setWorkspaceMembers,
  setAllWorkspaceMembers,
  getWorkspaceMembersRevision,
  getWorkspaceDirectory,
  workspaceMembersKey
} from './store'
import type { WorkspaceMembers } from './types'
import { parseWorkspaceMembers } from './types'
import { applyPendingMembership } from './hooks'
const alex = {
  id: 'alex',
  type: 'user',
  name: 'Alex',
  email: 'alex@example.com',
  isAnonymous: false
} as const
const bot = { id: 'alex', type: 'agent', name: 'Bot' } as const
afterEach(() => {
  setIdentity(null)
  queryClient.clear()
})
test('pre-mount snapshots populate the actual query cache and separate user and agent ids', () => {
  setIdentity(alex)
  setWorkspaceMembers('one', { members: [alex, bot], invitations: [] })
  expect(queryClient.getQueryData<WorkspaceMembers>(workspaceMembersKey('one'))).toEqual({
    members: [alex, bot],
    invitations: []
  })
  expect(getWorkspaceDirectory('one')?.map(user => user.id)).toEqual(['alex', 'agent:alex'])
  expect(getCurrentUser()?.id).toBe('alex')
})
test('per-workspace directory does not leak members or replace viewer', () => {
  setIdentity(alex)
  setWorkspaceMembers('one', { members: [alex, bot], invitations: [] })
  setWorkspaceMembers('two', { members: [alex], invitations: [] })
  expect(getWorkspaceDirectory('one')).toHaveLength(2)
  expect(getWorkspaceDirectory('two')).toHaveLength(1)
  expect(getIdentity()).toEqual(alex)
})
test('account switch removes previous membership snapshots', () => {
  setIdentity(alex)
  setWorkspaceMembers('one', { members: [alex, bot], invitations: [] })
  setIdentity({ ...alex, id: 'next' })
  expect(getWorkspaceDirectory('one')).toBeUndefined()
  expect(queryClient.getQueriesData({ queryKey: ['workspace-members'] })).toEqual([])
})
test('invalid snapshot publishes nothing', () => {
  setIdentity(alex)
  expect(() => parseWorkspaceMembers({ members: [alex, alex], invitations: [] })).toThrow()
  expect(getWorkspaceDirectory('one')).toBeUndefined()
})
test('all-workspace snapshots replace members and remove deleted workspaces', () => {
  setIdentity(alex)
  setAllWorkspaceMembers([
    { id: 'one', members: [alex, bot], invitations: [] },
    { id: 'two', members: [alex], invitations: [] }
  ])
  expect(getWorkspaceDirectory('one')).toHaveLength(2)
  expect(getWorkspaceDirectory('two')).toHaveLength(1)
  const before = getWorkspaceMembersRevision()
  setAllWorkspaceMembers([{ id: 'two', members: [alex, bot], invitations: [] }])
  expect(getWorkspaceDirectory('one')).toBeUndefined()
  expect(getWorkspaceDirectory('two')).toHaveLength(2)
  expect(getWorkspaceMembersRevision()).toBeGreaterThan(before)
  expect(() =>
    setAllWorkspaceMembers([
      { id: 'two', members: [alex], invitations: [] },
      { id: 'bad/id', members: [], invitations: [] }
    ])
  ).toThrow()
  expect(getWorkspaceDirectory('two')).toHaveLength(2)
  setAllWorkspaceMembers([])
  expect(getWorkspaceDirectory('two')).toBeUndefined()
})
test('optimistic pending actions are derived over the newest snapshot without mutating it', () => {
  const current = { members: [alex, { ...bot, membershipId: 'bot' }], invitations: [] }
  const pending = [{ id: 1, action: { type: 'invite', email: 'tony@example.com' } as const }]
  expect(applyPendingMembership(current, pending)?.invitations).toMatchObject([
    { email: 'tony@example.com', pending: true }
  ])
  expect(current.invitations).toEqual([])
  const pushed = { ...current, members: [alex] }
  expect(applyPendingMembership(pushed, pending)?.members).toEqual([alex])
  expect(applyPendingMembership(pushed, [])).toEqual(pushed)
})
