import { describe, expect, test } from 'bun:test'
import { join } from 'path'

import { skillsDirFor } from '../workspaces/init'
import { validateWorkspaceName, workspaceIdFromName } from '@/lib/workspace-name'

// Pure helpers only — `provisionWorkspace` composes `installBundledSkills` and
// `scaffoldMoiDir` (covered by their own tests) and would hit the network via
// `bun install`.

describe('skillsDirFor', () => {
  test('claude-code (and untyped) workspaces load skills from .claude/skills', () => {
    expect(skillsDirFor('/ws', 'claude-code')).toBe(join('/ws', '.claude', 'skills'))
    expect(skillsDirFor('/ws')).toBe(join('/ws', '.claude', 'skills'))
  })

  test('openclaw agents load skills from <workspace>/skills', () => {
    expect(skillsDirFor('/agent', 'openclaw')).toBe(join('/agent', 'skills'))
  })

  test('codex workspaces load skills from .agents/skills', () => {
    expect(skillsDirFor('/ws', 'codex')).toBe(join('/ws', '.agents', 'skills'))
  })
})

test('workspace names accept display text and reject empty or oversized names', () => {
  expect(validateWorkspaceName('Café / Research')).toBeNull()
  expect(validateWorkspaceName('  ')).not.toBeNull()
  expect(validateWorkspaceName('x'.repeat(101))).not.toBeNull()
})

test.each([
  ['Reading List', 'reading-list'],
  ['Café / Research', 'cafe-research'],
  ['../escape', 'escape'],
  ['.moi', 'moi'],
  ['日本語', 'workspace'],
  ['x'.repeat(100), 'x'.repeat(60)]
])('converts %s into a safe workspace ID', (name, id) => {
  expect(workspaceIdFromName(name)).toBe(id)
})
