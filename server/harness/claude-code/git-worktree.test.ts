import { test, expect } from 'bun:test'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { isLinkedGitWorktree, pointsIntoWorktrees } from './git-worktree'

test('pointsIntoWorktrees matches a linked worktree .git file', () => {
  expect(pointsIntoWorktrees('gitdir: /home/user/moi/.git/worktrees/feature-x')).toBe(true)
})

test('pointsIntoWorktrees tolerates a trailing newline and extra whitespace', () => {
  expect(pointsIntoWorktrees('gitdir:   /repo/.git/worktrees/wt\n')).toBe(true)
})

test('pointsIntoWorktrees matches Windows-style paths', () => {
  expect(pointsIntoWorktrees('gitdir: C:\\repo\\.git\\worktrees\\wt')).toBe(true)
})

test('pointsIntoWorktrees ignores submodules pointing into .git/modules', () => {
  expect(pointsIntoWorktrees('gitdir: ../.git/modules/vendor/lib')).toBe(false)
})

test('pointsIntoWorktrees ignores unrelated or malformed contents', () => {
  expect(pointsIntoWorktrees('')).toBe(false)
  expect(pointsIntoWorktrees('not a git file')).toBe(false)
  expect(pointsIntoWorktrees('ref: refs/heads/main')).toBe(false)
})

test('isLinkedGitWorktree returns true for a worktree .git file on disk', async () => {
  const base = await mkdtemp(join(tmpdir(), 'moi-wt-'))
  const dir = join(base, 'checkout')
  await mkdir(dir)
  await writeFile(join(dir, '.git'), 'gitdir: /repo/.git/worktrees/checkout\n')
  expect(await isLinkedGitWorktree(dir)).toBe(true)
})

test('isLinkedGitWorktree returns false for a normal repo (.git directory)', async () => {
  const base = await mkdtemp(join(tmpdir(), 'moi-repo-'))
  await mkdir(join(base, '.git'))
  expect(await isLinkedGitWorktree(base)).toBe(false)
})

test('isLinkedGitWorktree returns false when there is no .git at all', async () => {
  const base = await mkdtemp(join(tmpdir(), 'moi-plain-'))
  expect(await isLinkedGitWorktree(base)).toBe(false)
})
