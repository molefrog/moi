import { describe, expect, test } from 'bun:test'
import {
  parseRemoteWorkspaceConfig,
  personalWorkspaceConfig,
  workspaceApiBase,
  workspaceAddress
} from './workspace-config'

describe('workspace config', () => {
  test('personal defaults are identical for local and remote configs', () => {
    expect(personalWorkspaceConfig({ version: 2 })).toEqual({ layoutMode: 'split' })
    expect(
      parseRemoteWorkspaceConfig({
        version: 2,
        remote: { user_id: 'alice', workspace_id: 'board' }
      })
    ).toEqual({
      version: 2,
      remote: { user_id: 'alice', workspace_id: 'board' },
      layoutMode: 'split'
    })
  })
  test('remote config retains personal fields without copying shared layout', () => {
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
      remote: { user_id: 'alice', workspace_id: 'board' },
      layoutMode: 'fullscreen',
      selectedModel: 'sonnet'
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
