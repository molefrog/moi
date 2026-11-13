import { provisionWorkspace } from './init'
import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadLayout, saveLayout } from './layout'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})
async function fixture(config: unknown) {
  const path = await mkdtemp(join(tmpdir(), 'moi-config-'))
  directories.push(path)
  await mkdir(join(path, '.moi'))
  await Bun.write(join(path, '.moi/.workspace.json'), JSON.stringify(config))
  return path
}

test('reads and saves local layouts at version 1', async () => {
  const path = await fixture({ version: 1, widgetGrid: [], layoutMode: 'fullscreen' })
  const layout = await loadLayout(path)
  expect(layout.layoutMode).toBe('fullscreen')
  expect((await Bun.file(join(path, '.moi/.workspace.json')).json()).version).toBe(1)
  await saveLayout(layout, path)
  expect((await Bun.file(join(path, '.moi/.workspace.json')).json()).version).toBe(1)
})

test('remote references have no local layout to load or replace', async () => {
  const path = await fixture({ version: 2, remote: { user_id: 'owner', workspace_id: 'board' } })
  await expect(loadLayout(path)).rejects.toThrow('no local layout')
  await expect(
    saveLayout(
      {
        version: 1,
        widgetGrid: [],
        layoutMode: 'split',
        tabs: { open: ['overview'], active: 'overview' }
      },
      path
    )
  ).rejects.toThrow('Cannot replace')
})

test('remote provisioning reports skipped and preserves its config', async () => {
  const path = await fixture({ version: 2, remote: { user_id: 'alice', workspace_id: 'board' } })
  const config = Bun.file(join(path, '.moi/.workspace.json'))
  const before = await config.text()
  const result = await provisionWorkspace(path, 'codex')
  expect(result.scaffold).toBe('skipped')
  expect(result).not.toHaveProperty('installLogPath')
  expect(await config.text()).toBe(before)
  expect(await Bun.file(join(path, '.agents/skills/moi-workspace/SKILL.md')).exists()).toBe(true)
  expect(await Bun.file(join(path, '.moi/package.json')).exists()).toBe(false)
})

test('existing local scaffolding omits the install log path', async () => {
  const path = await fixture({ version: 1, widgetGrid: [] })
  await Bun.write(join(path, '.moi/package.json'), '{}')
  const result = await provisionWorkspace(path, 'codex')
  expect(result.scaffold).toBe('exists')
  expect(result).not.toHaveProperty('installLogPath')
})

test('version 2 is reserved for remote references', async () => {
  const path = await fixture({ version: 2, widgetGrid: [] })
  await expect(loadLayout(path)).rejects.toThrow('Unsupported workspace config version')
})
