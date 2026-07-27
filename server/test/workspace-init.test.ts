import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { provisionWorkspace, skillsDirFor, validateWorkspaceFolderName } from '../workspace-init'

let workspaceRoot = ''

afterEach(async () => {
  if (!workspaceRoot) return
  await rm(workspaceRoot, { recursive: true, force: true })
  workspaceRoot = ''
})

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

describe('validateWorkspaceFolderName', () => {
  test('accepts plain folder names', () => {
    expect(validateWorkspaceFolderName('my-workspace')).toBeNull()
    expect(validateWorkspaceFolderName('Notes 2026')).toBeNull()
    expect(validateWorkspaceFolderName('a')).toBeNull()
    expect(validateWorkspaceFolderName('v1.2_final')).toBeNull()
  })

  test('rejects empty and oversized names', () => {
    expect(validateWorkspaceFolderName('')).not.toBeNull()
    expect(validateWorkspaceFolderName('x'.repeat(65))).not.toBeNull()
  })

  test('rejects path separators and traversal', () => {
    expect(validateWorkspaceFolderName('a/b')).not.toBeNull()
    expect(validateWorkspaceFolderName('a\\b')).not.toBeNull()
    expect(validateWorkspaceFolderName('..')).not.toBeNull()
    expect(validateWorkspaceFolderName('../escape')).not.toBeNull()
  })

  test('rejects hidden names so `.moi`/`.claude` can never collide', () => {
    expect(validateWorkspaceFolderName('.moi')).not.toBeNull()
    expect(validateWorkspaceFolderName('.claude')).not.toBeNull()
    expect(validateWorkspaceFolderName('.hidden')).not.toBeNull()
  })

  test('rejects trailing dots and spaces', () => {
    expect(validateWorkspaceFolderName('name.')).not.toBeNull()
    expect(validateWorkspaceFolderName('name ')).not.toBeNull()
  })
})

describe('provisionWorkspace', () => {
  test('continues workspace initialization when the shadcn installer fails', async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), 'moi-provision-'))
    await mkdir(join(workspaceRoot, '.moi'), { recursive: true })
    await Bun.write(join(workspaceRoot, '.moi', 'package.json'), '{}\n')
    const warn = spyOn(console, 'warn').mockImplementation(() => {})

    try {
      const result = await provisionWorkspace(workspaceRoot, 'codex', async (root, type) => {
        expect(root).toBe(workspaceRoot)
        expect(type).toBe('codex')
        return { ok: false, reason: 'network unavailable' }
      })

      expect(result).toEqual({
        skillsDir: join(workspaceRoot, '.agents', 'skills'),
        scaffold: 'exists'
      })
      expect(await Bun.file(join(result.skillsDir, 'moi-workspace', 'SKILL.md')).exists()).toBe(
        true
      )
      expect(warn).toHaveBeenCalledWith(
        '[skills] official shadcn skill install failed: network unavailable'
      )
    } finally {
      warn.mockRestore()
    }
  })

  test('continues workspace initialization when the installer process throws', async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), 'moi-provision-'))
    await mkdir(join(workspaceRoot, '.moi'), { recursive: true })
    await Bun.write(join(workspaceRoot, '.moi', 'package.json'), '{}\n')
    const warn = spyOn(console, 'warn').mockImplementation(() => {})

    try {
      const result = await provisionWorkspace(workspaceRoot, 'claude-code', async () => {
        throw new Error('spawn failed')
      })

      expect(result.scaffold).toBe('exists')
      expect(warn).toHaveBeenCalledWith(
        '[skills] official shadcn skill install failed: spawn failed'
      )
    } finally {
      warn.mockRestore()
    }
  })
})
