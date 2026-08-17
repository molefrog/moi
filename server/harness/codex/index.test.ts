import { describe, expect, test } from 'bun:test'

import { formatCodexStatusLines } from './status'

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
