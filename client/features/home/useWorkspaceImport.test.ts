import { describe, expect, test } from 'bun:test'

import { workspaceImportDecision, workspaceImportTypes } from './useWorkspaceImport'
import type { DiscoveredWorkspace } from '@/lib/types'

describe('workspaceImportTypes', () => {
  test('offers Claude Code and Codex when no provider is detected', () => {
    const workspace: DiscoveredWorkspace = { path: '/workspace', types: [] }

    expect(workspaceImportTypes(workspace)).toEqual(['claude-code', 'codex'])
    expect(workspaceImportDecision(workspace)).toEqual({
      kind: 'choose',
      types: ['claude-code', 'codex'],
      selectedType: 'claude-code'
    })
  })

  test('keeps one detected provider for direct import', () => {
    const workspace: DiscoveredWorkspace = { path: '/workspace', types: ['openclaw'] }

    expect(workspaceImportTypes(workspace)).toEqual(['openclaw'])
    expect(workspaceImportDecision(workspace)).toEqual({
      kind: 'direct',
      type: 'openclaw'
    })
  })

  test('deduplicates and orders multiple detected providers', () => {
    expect(
      workspaceImportDecision({
        path: '/workspace',
        types: ['openclaw', 'codex', 'claude-code', 'codex']
      })
    ).toEqual({
      kind: 'choose',
      types: ['claude-code', 'codex', 'openclaw'],
      selectedType: 'claude-code'
    })
    expect(
      workspaceImportTypes({
        path: '/workspace',
        types: ['openclaw', 'codex', 'claude-code', 'codex']
      })
    ).toEqual(['claude-code', 'codex', 'openclaw'])
  })

  test('preselects the first detected provider in display order', () => {
    expect(
      workspaceImportDecision({
        path: '/workspace',
        types: ['openclaw', 'codex']
      })
    ).toEqual({
      kind: 'choose',
      types: ['codex', 'openclaw'],
      selectedType: 'codex'
    })
  })
})
