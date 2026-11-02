import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { onboarding } from './onboarding'
import { getAppSettings, saveAppSettings, setAppSettingsDir } from '../app-settings'
import { DATA_DIR } from '../data-dir'
import * as jobs from '../onboarding/jobs'
let directory: string
const restores: (() => void)[] = []
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'moi-onboarding-api-'))
  setAppSettingsDir(directory)
})
afterEach(async () => {
  restores.splice(0).forEach(restore => restore())
  setAppSettingsDir(DATA_DIR)
  await rm(directory, { recursive: true, force: true })
})
const command = (path: string, body: object) =>
  onboarding.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
test('saved false disables jobs even when old saved progress exists', async () => {
  saveAppSettings({ showOnboarding: false })
  await Bun.write(
    join(directory, 'onboarding.json'),
    JSON.stringify({ progress: { showOnboarding: true, phase: 'ideas' } })
  )
  expect(
    (await command('/discover', { harness: 'codex', runId: crypto.randomUUID() })).status
  ).toBe(403)
})
test('discovery is enabled by default without saving flow progress', async () => {
  const spy = spyOn(jobs, 'discoverIdeas').mockResolvedValue({ status: 'done', ideas: [] })
  restores.push(() => spy.mockRestore())
  const input = { harness: 'codex', runId: crypto.randomUUID() }
  expect((await command('/discover', input)).status).toBe(200)
  expect(spy).toHaveBeenCalledWith(input)
  expect(await Bun.file(join(directory, 'onboarding.json')).exists()).toBe(false)
  expect(getAppSettings().showOnboarding).toBe(true)
  expect((await command('/discover', { ...input, runId: '../settings' })).status).toBe(400)
})
test('creation uses the server idea and keeps the flag enabled', async () => {
  saveAppSettings({ showOnboarding: true })
  const idea = {
    id: crypto.randomUUID(),
    name: 'Planner',
    description: 'Plan',
    icon: 'calendar' as const,
    theme: { font: 'serif' as const, color: 'paper' as const },
    views: [
      {
        name: 'Week',
        icon: 'calendar' as const,
        description: 'Weekly plan',
        features: ['Add and complete tasks']
      },
      {
        name: 'History',
        icon: 'calendar' as const,
        description: 'Past weeks',
        features: ['Review completed tasks']
      },
      {
        name: 'Notes',
        icon: 'file' as const,
        description: 'Weekly notes',
        features: ['Save notes']
      },
      {
        name: 'Sources',
        icon: 'book' as const,
        description: 'Saved sources',
        features: ['Browse sources']
      }
    ],
    widgets: []
  }
  const discovery = spyOn(jobs, 'discoverIdeas').mockResolvedValue({
    status: 'done',
    ideas: [idea]
  })
  const build = spyOn(jobs, 'createFromIdea').mockResolvedValue({
    status: 'done',
    workspaceId: 'created'
  })
  restores.push(
    () => discovery.mockRestore(),
    () => build.mockRestore()
  )
  const input = {
    harness: 'codex',
    runId: crypto.randomUUID(),
    operationId: crypto.randomUUID(),
    ideaId: idea.id
  }
  expect((await command('/create', { ...input, brief: 'untrusted override' })).status).toBe(200)
  expect(build).toHaveBeenCalledWith(
    { harness: 'codex', operationId: input.operationId, idea },
    undefined
  )
  expect(getAppSettings().showOnboarding).toBe(true)
  expect((await command('/create', { ...input, ideaId: crypto.randomUUID() })).status).toBe(409)
})
