import { afterEach, beforeEach, describe, expect, setSystemTime, spyOn, test } from 'bun:test'
import { mkdir, mkdtemp, open, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { discoverClaudeWorkspaces } from './discovery'

describe('Claude workspace discovery', () => {
  let scratch: string
  let projects: string
  let workspace: string

  beforeEach(async () => {
    scratch = await mkdtemp(join(tmpdir(), 'moi-cc-discovery-'))
    projects = join(scratch, 'projects')
    workspace = join(scratch, 'my-project.with spaces')
    await mkdir(workspace)
  })

  afterEach(async () => {
    setSystemTime()
    await rm(scratch, { recursive: true, force: true })
  })

  async function transcript(project: string, content: string, name = 'session.jsonl') {
    const dir = join(projects, project)
    await mkdir(dir, { recursive: true })
    const path = join(dir, name)
    await Bun.write(path, content)
    return path
  }

  const record = (cwd: string) =>
    JSON.stringify({ type: 'user', cwd, message: { content: 'hi' } }) + '\n'
  const discover = (registered = new Set<string>()) =>
    discoverClaudeWorkspaces(registered, projects)
  const candidate = (path: string) => ({ path, type: 'claude-code' as const })

  test('reads cwd after metadata records and ignores encoded directory names', async () => {
    await transcript('ambiguous-directory-name', '{"type":"queue-operation"}\n' + record(workspace))
    expect(await discover()).toEqual([candidate(workspace)])
  })

  test('ignores malformed records and nested cwd values', async () => {
    await transcript(
      'project',
      'bad JSON\nnull\n' +
        JSON.stringify({ message: { cwd: workspace } }) +
        '\n' +
        record(workspace)
    )
    expect(await discover()).toEqual([candidate(workspace)])
  })

  test('does not guess paths from truncated records or relative cwd values', async () => {
    await transcript('truncated', record(workspace).slice(0, -4))
    await transcript('relative', record('relative/path'))
    expect(await discover()).toEqual([])
  })

  test('deduplicates directories and filters registrations on every cached request', async () => {
    await transcript('first', record(workspace))
    await transcript('second', record(workspace))
    expect(await discover()).toEqual([candidate(workspace)])
    expect(await discover(new Set([workspace + '/.']))).toEqual([])
    expect(await discover()).toEqual([candidate(workspace)])
  })

  test('skips deleted directories, files, and linked worktrees; keeps submodules', async () => {
    const linked = join(scratch, 'linked')
    const submodule = join(scratch, 'submodule')
    const file = join(scratch, 'file')
    await mkdir(linked)
    await mkdir(submodule)
    await Bun.write(join(linked, '.git'), 'gitdir: /repo/.git/worktrees/linked\n')
    await Bun.write(join(submodule, '.git'), 'gitdir: /repo/.git/modules/submodule\n')
    await Bun.write(file, 'file')
    await transcript('deleted', record(join(scratch, 'missing')))
    await transcript('file', record(file))
    await transcript('linked', record(linked))
    await transcript('submodule', record(submodule))
    expect(await discover()).toEqual([candidate(submodule)])
  })

  test('does not recurse into subagents or follow transcript/project symlinks', async () => {
    const file = await transcript('nested/session/subagents', record(workspace))
    await symlink(file, join(projects, 'nested', 'symlink.jsonl'))
    await symlink(join(projects, 'nested/session/subagents'), join(projects, 'linked-project'))
    expect(await discover()).toEqual([])
  })

  test('tolerates absent history and unreadable project entries', async () => {
    expect(await discover()).toEqual([])
    // Switch roots so the negative cache does not hide this second fixture.
    projects = join(scratch, 'other-projects')
    await transcript('good', record(workspace))
    await Bun.write(join(projects, 'not-a-directory'), 'x')
    expect(await discover()).toEqual([candidate(workspace)])
  })

  test('caps transcript attempts in a project without usable metadata', async () => {
    for (let i = 0; i < 20; i++) await transcript('project', '{}\n', `${i}.jsonl`)
    const reads = spyOn(Bun, 'file')
    try {
      expect(await discover()).toEqual([])
      expect(reads).toHaveBeenCalledTimes(3)
    } finally {
      reads.mockRestore()
    }
  })

  test('reads only the head of a multi-gigabyte transcript', async () => {
    const file = await transcript('large', record(workspace))
    const handle = await open(file, 'r+')
    try {
      await handle.truncate(6 * 1024 ** 3)
    } finally {
      await handle.close()
    }
    expect(await discover()).toEqual([candidate(workspace)])
  })

  test('does not scan past the byte budget looking for cwd', async () => {
    await transcript('large', ' '.repeat(64 * 1024) + '\n' + record(workspace))
    expect(await discover()).toEqual([])
  })

  test('stops scheduling reads after the scan deadline', async () => {
    await transcript('project', record(workspace))
    const now = spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValue(2001)
    const reads = spyOn(Bun, 'file')
    try {
      expect(await discover()).toEqual([])
      expect(reads).not.toHaveBeenCalled()
    } finally {
      now.mockRestore()
      reads.mockRestore()
    }
  })

  test('shares in-flight scans and caches completed results', async () => {
    await transcript('project', record(workspace))
    const reads = spyOn(Bun, 'file')
    try {
      const results = await Promise.all(Array.from({ length: 20 }, () => discover()))
      expect(results.every(result => result[0]?.path === workspace)).toBe(true)
      const count = reads.mock.calls.length
      await discover()
      expect(reads.mock.calls.length).toBe(count)
      // One transcript head and one .git check across all callers.
      expect(count).toBe(2)
    } finally {
      reads.mockRestore()
    }
  })

  test('refreshes after the cache expires', async () => {
    const file = await transcript('project', record(workspace))
    expect(await discover()).toEqual([candidate(workspace)])
    await rm(file)
    expect(await discover()).toEqual([candidate(workspace)])
    setSystemTime(Date.now() + 31_000)
    expect(await discover()).toEqual([])
  })

  test('honors CLAUDE_CONFIG_DIR and does not reuse another root cache', async () => {
    const original = process.env.CLAUDE_CONFIG_DIR
    try {
      await transcript('project', record(workspace))
      process.env.CLAUDE_CONFIG_DIR = scratch
      expect(await discoverClaudeWorkspaces(new Set())).toEqual([candidate(workspace)])
      process.env.CLAUDE_CONFIG_DIR = join(scratch, 'other-config')
      expect(await discoverClaudeWorkspaces(new Set())).toEqual([])
    } finally {
      if (original === undefined) delete process.env.CLAUDE_CONFIG_DIR
      else process.env.CLAUDE_CONFIG_DIR = original
    }
  })
})
