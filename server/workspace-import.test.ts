import { describe, expect, test } from 'bun:test'

import { resolveWorkspaceImportMetadata } from './workspace-import'

describe('resolveWorkspaceImportMetadata', () => {
  test('does not probe OpenClaw for Claude Code or Codex imports', async () => {
    const discover = async () => {
      throw new Error('should not be called')
    }

    expect(await resolveWorkspaceImportMetadata('/workspace', 'claude-code', discover)).toEqual({})
    expect(await resolveWorkspaceImportMetadata('/workspace', 'codex', discover)).toEqual({})
  })

  // A UI import must capture what `moi hermes init` does, or the entry has no
  // agentId and every profile renders as a generic "Hermes agent".
  test('resolves Hermes profile metadata by normalized path', async () => {
    const metadata = await resolveWorkspaceImportMetadata(
      '/home/u/.hermes/profiles/research/workspace',
      'hermes',
      async () => {
        throw new Error('OpenClaw discovery should not be called')
      },
      async () => [
        {
          agentId: 'research',
          home: '/home/u/.hermes/profiles/research',
          path: '/home/u/.hermes/profiles/research/nested/../workspace',
          name: 'Research agent',
          isDefault: false,
          model: 'kimi-k2.7-code'
        }
      ]
    )

    expect(metadata).toEqual({ agentId: 'research', name: 'Research agent' })
  })

  test('marks the default Hermes profile', async () => {
    const metadata = await resolveWorkspaceImportMetadata(
      '/home/u/.hermes/workspace',
      'hermes',
      async () => [],
      async () => [
        {
          agentId: 'default',
          home: '/home/u/.hermes',
          path: '/home/u/.hermes/workspace',
          isDefault: true
        }
      ]
    )

    expect(metadata).toEqual({ agentId: 'default', isDefault: true })
  })

  test('rejects a Hermes import for a folder no profile owns', async () => {
    await expect(
      resolveWorkspaceImportMetadata(
        '/somewhere/else',
        'hermes',
        async () => [],
        async () => []
      )
    ).rejects.toThrow('No Hermes profile owns this folder')
  })

  test('resolves OpenClaw metadata by normalized path', async () => {
    const metadata = await resolveWorkspaceImportMetadata('/workspace', 'openclaw', async () => [
      {
        path: '/workspace/nested/..',
        agentId: 'agent-a',
        name: 'Agent A',
        isDefault: true,
        lastRunAt: '2026-07-20T10:00:00.000Z'
      }
    ])

    expect(metadata).toEqual({
      agentId: 'agent-a',
      name: 'Agent A',
      isDefault: true,
      lastRunAt: '2026-07-20T10:00:00.000Z'
    })
  })

  test('prefers the default OpenClaw agent when a path is shared', async () => {
    const metadata = await resolveWorkspaceImportMetadata('/workspace', 'openclaw', async () => [
      {
        path: '/workspace',
        agentId: 'recent',
        isDefault: false,
        lastRunAt: '2026-07-20T11:00:00.000Z'
      },
      {
        path: '/workspace',
        agentId: 'default',
        isDefault: true,
        lastRunAt: '2026-07-19T11:00:00.000Z'
      }
    ])

    expect(metadata.agentId).toBe('default')
  })

  test('rejects an OpenClaw import that cannot be resolved', async () => {
    await expect(
      resolveWorkspaceImportMetadata('/workspace', 'openclaw', async () => [])
    ).rejects.toThrow('OpenClaw is not initialized for this folder')
  })
})
