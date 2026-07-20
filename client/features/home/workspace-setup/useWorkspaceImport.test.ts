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

  test('uses canonical order for multiple detected agents', () => {
    expect(
      workspaceImportDefaultType({
        path: '/workspace',
        types: ['openclaw', 'codex', 'claude-code', 'codex']
      })
    ).toBe('claude-code')
  })

  test('deduplicates detected agents before selecting', () => {
    expect(
      workspaceImportDefaultType({
        path: '/workspace',
        types: ['openclaw', 'codex', 'codex']
      })
    ).toBe('codex')
  })
})
