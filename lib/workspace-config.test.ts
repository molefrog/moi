import { describe, expect, test } from 'bun:test'
import {
  parseRemoteWorkspaceConfig,
  parseRemoteWorkspaceTarget,
  workspaceApiBase,
  workspaceAddress
} from './workspace-config'

describe('workspace config', () => {
  test('remote references contain only version and destination', () => {
    expect(
      parseRemoteWorkspaceConfig({
        version: 2,
        remote: { user_id: 'alice', workspace_id: 'board' }
      })
    ).toEqual({
      version: 2,
      remote: { user_id: 'alice', workspace_id: 'board' }
    })
  })
  test('remote config contains only its version and destination', () => {
    expect(
      parseRemoteWorkspaceConfig({
        version: 2,
        remote: { user_id: 'alice', workspace_id: 'board' },
        layoutMode: 'fullscreen',
        selectedModel: 'sonnet',
        widgetGrid: []
      })
    ).toEqual({
      version: 2,
      remote: { user_id: 'alice', workspace_id: 'board' }
    })
  })
  test('requires a complete remote destination', () => {
    for (const remote of [
      null,
      {},
      { user_id: 'alice' },
      { user_id: 'alice', workspace_id: '../board' }
    ])
      expect(() => parseRemoteWorkspaceConfig({ version: 2, remote })).toThrow()
  })
  test('uses owner identifiers independently of visitor registration', () => {
    expect(workspaceAddress('board', 'alice')).toBe('alice:board')
    expect(workspaceAddress('a b', 'owner:id')).toBe('owner%3Aid:a%20b')
    expect(workspaceApiBase('visitor')).toBe('/api/workspaces/visitor')
    expect(workspaceApiBase('board', 'alice')).toBe('/api/workspaces/alice:board')
  })
})

test('remote addresses share the registered workspace ID rules', () => {
  for (const workspace_id of ['a b', '-board', '_board', 'a:b', 'create', 'a'.repeat(65)]) {
    expect(() => parseRemoteWorkspaceTarget({ user_id: 'alice', workspace_id })).toThrow()
    expect(() =>
      parseRemoteWorkspaceConfig({ version: 2, remote: { user_id: 'alice', workspace_id } })
    ).toThrow()
  }
  for (const user_id of ['', 'a b', 'a:b', '../alice', 'a'.repeat(65)])
    expect(() => parseRemoteWorkspaceTarget({ user_id, workspace_id: 'board' })).toThrow()
  expect(parseRemoteWorkspaceTarget({ user_id: 'alice-1', workspace_id: 'board_1' })).toEqual({
    user_id: 'alice-1',
    workspace_id: 'board_1'
  })
})
