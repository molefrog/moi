import { describe, expect, spyOn, test } from 'bun:test'
import type { WorkspaceEntry } from '@/lib/types'
import * as clients from './client'
import { harnessFor } from '../registry'
import type { Json } from './transport'
import { formatCodexStatusLines } from './status'

test.each(['gpt-6.1-sol', undefined])(
  'Codex fork applies saved model %s at creation',
  async model => {
    const ws: WorkspaceEntry = { id: 'workspace', path: '/workspace', type: 'codex', addedAt: '' }
    const calls: { method: string; params?: Json }[] = []
    const client: clients.CodexClient = {
      workspacePath: ws.path,
      cliVersion: '0.160.0',
      supportsAdditionalContext: true,
      isAlive: () => true,
      onNotification: () => () => {},
      rpc: async <T>(method: string, params?: Json) => {
        calls.push({ method, params })
        return { thread: { id: 'child' } } as T
      }
    }
    const clientSpy = spyOn(clients, 'getCodexClient').mockResolvedValue(client)
    try {
      expect(
        await harnessFor(ws).forkSession!(ws, 'source', { model, effort: 'high', fastMode: false })
      ).toBe('child')
      expect(calls).toEqual([
        { method: 'thread/fork', params: { threadId: 'source', ...(model ? { model } : {}) } }
      ])
    } finally {
      clientSpy.mockRestore()
    }
  }
)

describe('formatCodexStatusLines', () => {
  test('shows live app-servers even when they are idle', () => {
    const lines = formatCodexStatusLines({
      executable: '/usr/bin/codex',
      processes: [
        { workspacePath: '/work/busy', pid: 101, startedAt: 1 },
        { workspacePath: '/work/idle', pid: 202, startedAt: 2 }
      ],
      active: [
        {
          workspaceId: 'busy-workspace',
          workspacePath: '/work/busy',
          sessionId: 'thread-1',
          activity: 'running'
        }
      ]
    })

    expect(lines).toContain('codex app-servers  2 (1 busy, 1 idle)')
    expect(lines).toContain('  ▶ busy  ws=/work/busy  pid=101')
    expect(lines).toContain('  ○ idle  ws=/work/idle  pid=202')
    expect(lines).toContain('active Codex turns  1')
  })

  test('makes an empty process registry explicit', () => {
    const lines = formatCodexStatusLines({ executable: null, processes: [], active: [] })

    expect(lines).toContain('codex executable  (not found)')
    expect(lines).toContain('codex app-servers  0 (0 busy, 0 idle)')
    expect(lines).toContain('  (none running)')
  })
})
