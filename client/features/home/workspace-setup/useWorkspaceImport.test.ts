import { describe, expect, test } from 'bun:test'

import { workspaceImportDefaultType } from './useWorkspaceImport'
import type { DiscoveredWorkspace } from '@/lib/types'

describe('workspaceImportDefaultType', () => {
  test('defaults to Claude Code when no agent is detected', () => {
    const workspace: DiscoveredWorkspace = { path: '/workspace', types: [] }

    expect(workspaceImportDefaultType(workspace)).toBe('claude-code')
  })

  test('preselects one detected agent', () => {
    expect(workspaceImportDefaultType({ path: '/workspace', types: ['codex'] })).toBe('codex')
    expect(workspaceImportDefaultType({ path: '/workspace', types: ['openclaw'] })).toBe('openclaw')
  })

  test('uses the first agent returned by the API', () => {
    expect(
      workspaceImportDefaultType({
        path: '/workspace',
        types: ['codex', 'openclaw']
      })
    ).toBe('codex')
  })
})
