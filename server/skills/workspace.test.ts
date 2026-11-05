import { afterEach, expect, test } from 'bun:test'
import { lstat, mkdir, mkdtemp, readlink, realpath, rename, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { provisionWorkspace } from '../workspaces/init'
import { getWorkspaceSkillsStatus, updateWorkspaceSkills } from './update'
import { bundledSkillDirectory } from './template'

const roots: string[] = []

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'moi-shared-skill-'))
  roots.push(root)
  const workspace = join(root, 'workspace')
  const canonical = join(workspace, '.agents', 'skills', 'moi-workspace')
  const claude = join(workspace, '.claude', 'skills', 'moi-workspace')
  return { root, workspace, canonical, claude }
}

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

for (const type of ['claude-code', 'codex'] as const) {
  test(`${type} init installs one skill, and its relative link survives moving the workspace`, async () => {
    const { root, workspace, canonical, claude } = await fixture()
    // Skip dependency installation while exercising the real init entry point.
    await Bun.write(join(workspace, '.moi', 'package.json'), '{}\n')
    await provisionWorkspace(workspace, type)
    expect((await lstat(canonical)).isDirectory()).toBe(true)
    expect(await readlink(claude)).toBe('../../.agents/skills/moi-workspace')
    expect(await realpath(claude)).toBe(await realpath(canonical))
    const moved = join(root, 'moved')
    await rename(workspace, moved)
    for (const harness of ['claude-code', 'codex'] as const) {
      const status = await getWorkspaceSkillsStatus(moved, harness)
      expect(status.skills).toHaveLength(2)
      expect(status.updateAvailable).toBe(false)
      for (const skill of status.skills) expect(skill.installed).toBe(skill.bundled)
    }
    expect((await updateWorkspaceSkills(moved, type)).changedSkills).toEqual([])
  })
}

for (const directory of ['.claude', '.agents']) {
  test(`rejects a ${directory}/skills folder link without changing its contents`, async () => {
    const { workspace } = await fixture()
    const other = directory === '.claude' ? '.agents' : '.claude'
    await Bun.write(join(workspace, other, 'skills', 'custom', 'SKILL.md'), 'custom skill')
    await Bun.write(join(workspace, other, 'skills', 'moi-workspace', 'local.md'), 'discard')
    await mkdir(join(workspace, directory), { recursive: true })
    await symlink(`../${other}/skills`, join(workspace, directory, 'skills'), 'dir')
    await expect(updateWorkspaceSkills(workspace)).rejects.toThrow('use a real skills directory')
    expect(await readlink(join(workspace, directory, 'skills'))).toBe(`../${other}/skills`)
    expect(await Bun.file(join(workspace, other, 'skills', 'custom', 'SKILL.md')).text()).toBe(
      'custom skill'
    )
    expect(
      await Bun.file(join(workspace, other, 'skills', 'moi-workspace', 'local.md')).text()
    ).toBe('discard')
  })

  test(`replaces a broken ${directory} skill link`, async () => {
    const { workspace, canonical, claude } = await fixture()
    const path = directory === '.claude' ? claude : canonical
    await mkdir(dirname(path), { recursive: true })
    await symlink('missing', path, 'dir')
    expect((await getWorkspaceSkillsStatus(workspace)).updateAvailable).toBe(true)
    await updateWorkspaceSkills(workspace)
    expect(await realpath(claude)).toBe(await realpath(canonical))
    expect((await getWorkspaceSkillsStatus(workspace)).updateAvailable).toBe(false)
  })
}

for (const existing of [false, true]) {
  test(`supports .claude pointing to .agents with ${existing ? 'an existing' : 'a new'} skill`, async () => {
    const { workspace, canonical, claude } = await fixture()
    await mkdir(join(workspace, '.agents'), { recursive: true })
    await symlink('.agents', join(workspace, '.claude'), 'dir')
    if (existing) await Bun.write(join(canonical, 'local.md'), 'discard')
    await Bun.write(join(workspace, '.agents', 'skills', 'custom', 'SKILL.md'), 'keep')

    await updateWorkspaceSkills(workspace)
    expect(await readlink(join(workspace, '.claude'))).toBe('.agents')
    expect((await lstat(claude)).isDirectory()).toBe(true)
    expect(await realpath(claude)).toBe(await realpath(canonical))
    expect(await Bun.file(join(canonical, 'local.md')).exists()).toBe(false)
    expect(await Bun.file(join(workspace, '.claude', 'skills', 'custom', 'SKILL.md')).text()).toBe(
      'keep'
    )
    for (const type of ['claude-code', 'codex'] as const) {
      expect((await getWorkspaceSkillsStatus(workspace, type)).updateAvailable).toBe(false)
      expect((await updateWorkspaceSkills(workspace, type)).changedSkills).toEqual([])
    }
  })
}

test('rejects an external .claude parent before changing either installed skill', async () => {
  const { root, workspace, canonical, claude } = await fixture()
  const external = join(root, 'external-claude')
  await Bun.write(join(canonical, 'SKILL.md'), 'existing canonical skill')
  await Bun.write(join(external, 'skills', 'moi-workspace', 'SKILL.md'), 'existing Claude skill')
  await symlink(external, join(workspace, '.claude'), 'dir')

  await expect(updateWorkspaceSkills(workspace)).rejects.toThrow('use a real .claude directory')
  expect(await Bun.file(join(canonical, 'SKILL.md')).text()).toBe('existing canonical skill')
  expect(await Bun.file(join(claude, 'SKILL.md')).text()).toBe('existing Claude skill')
  expect((await lstat(claude)).isDirectory()).toBe(true)
  expect(await readlink(join(workspace, '.claude'))).toBe(external)
})

test('resets conflicting local files and collab guidance in both copies', async () => {
  const { workspace, canonical, claude } = await fixture()
  for (const path of [canonical, claude]) {
    await Bun.write(join(path, 'local.md'), path)
    await Bun.write(join(path, 'references', 'COLLAB.md'), path)
    await Bun.write(join(path, 'SKILL.md'), path)
    await Bun.write(join(dirname(path), 'custom', 'SKILL.md'), 'keep')
  }
  await updateWorkspaceSkills(workspace)
  for (const path of [canonical, claude]) {
    expect(await Bun.file(join(path, 'SKILL.md')).text()).toBe(
      await Bun.file(join(bundledSkillDirectory('moi-workspace'), 'SKILL.md')).text()
    )
    expect(await Bun.file(join(path, 'local.md')).exists()).toBe(false)
    expect(await Bun.file(join(path, 'references', 'COLLAB.md')).exists()).toBe(false)
    expect(await Bun.file(join(dirname(path), 'custom', 'SKILL.md')).text()).toBe('keep')
  }
})

test('replaces skill symlinks without deleting their external targets', async () => {
  const { root, workspace, canonical, claude } = await fixture()
  const external = join(root, 'external')
  await Bun.write(join(external, 'SKILL.md'), 'external skill')
  for (const path of [canonical, claude]) {
    await mkdir(dirname(path), { recursive: true })
    await symlink(external, path, 'dir')
  }
  await updateWorkspaceSkills(workspace)
  expect(await Bun.file(join(external, 'SKILL.md')).text()).toBe('external skill')
  expect((await lstat(canonical)).isDirectory()).toBe(true)
  expect(await realpath(claude)).toBe(await realpath(canonical))
})

test('repairs a loop between the two skill links', async () => {
  const { workspace, canonical, claude } = await fixture()
  await mkdir(dirname(canonical), { recursive: true })
  await mkdir(dirname(claude), { recursive: true })
  await symlink('../../.claude/skills/moi-workspace', canonical, 'dir')
  await symlink('../../.agents/skills/moi-workspace', claude, 'dir')
  await updateWorkspaceSkills(workspace)
  expect(await realpath(claude)).toBe(await realpath(canonical))
  expect((await getWorkspaceSkillsStatus(workspace)).updateAvailable).toBe(false)
})
