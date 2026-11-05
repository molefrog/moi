import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { IdeaDiscovery, WorkspaceBuild } from '@/lib/onboarding'
import { harnessFor } from '../harness/registry'
import { createOnboardingJobs } from './jobs'
import { ideasSchema } from './ideas'
import { composeBuildBrief } from './brief'
import { getWorkspaceConfig, setWorkspaceConfig } from '../workspaces/config'
import { loadLayout } from '../workspaces/layout'
import type { HarnessActionInput } from '../harness/types'

const cleanup: string[] = []
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map(path => rm(path, { recursive: true, force: true })))
})
async function directory() {
  const dir = await mkdtemp(join(tmpdir(), 'moi-onboarding-test-'))
  cleanup.push(dir)
  return dir
}
const options = ['Reading list', 'Weekly planner', 'Project tracker'].map((name, index) => ({
  name,
  description: 'Useful project',
  icon: 'book' as const,
  theme: {
    font: (['serif', 'mono', 'rounded'] as const)[index]!,
    color: (['paper', 'sky', 'mint'] as const)[index]!
  },
  views: [
    {
      name: 'Reading list',
      icon: 'book' as const,
      description: 'Saved articles',
      features: ['Search articles by title', 'Save reading progress locally']
    },
    {
      name: 'Reading history',
      icon: 'calendar' as const,
      description: 'Finished articles',
      features: ['Browse completed articles']
    },
    {
      name: 'Notes',
      icon: 'file' as const,
      description: 'Reading notes',
      features: ['Save takeaways']
    }
  ],
  widgets: [
    {
      name: 'Reading count',
      description: 'Unread articles',
      features: ['Show unread count and open the reading list']
    }
  ]
}))
function progress(): IdeaDiscovery {
  return {
    harness: 'claude-code',
    runId: crypto.randomUUID()
  }
}
async function settle<T>(read: () => Promise<T>, done: (value: T) => boolean) {
  for (let i = 0; i < 100; i++) {
    const value = await read()
    if (done(value)) return value
    if ((value as { status?: string }).status === 'failed') throw new Error(JSON.stringify(value))
    await Bun.sleep(5)
  }
  throw new Error('Job did not settle')
}
test('concurrent polls run discovery once, persist results, and keep separate runs distinct', async () => {
  const dir = await directory()
  let calls = 0
  const jobs = createOnboardingJobs({
    directory: dir,
    harnessFor: () => ({
      ...harnessFor('claude-code'),
      runAction: async input => {
        calls++
        return input.resultSchema.parse({ options })
      }
    })
  })
  const state = progress()
  await Promise.all([jobs.discoverIdeas(state), jobs.discoverIdeas(state)])
  const result = await settle(
    () => jobs.discoverIdeas(state),
    value => value.status === 'done'
  )
  expect(calls).toBe(1)
  const restarted = createOnboardingJobs({
    directory: dir,
    harnessFor: () => ({
      ...harnessFor('claude-code'),
      runAction: async () => {
        throw new Error('must not run')
      }
    })
  })
  expect(await restarted.discoverIdeas(state)).toEqual(result)
  const next = { ...state, runId: crypto.randomUUID() }
  await jobs.discoverIdeas(next)
  await settle(
    () => jobs.discoverIdeas(next),
    value => value.status === 'done'
  )
  expect(calls).toBe(2)
})
test('skip cancellation wins over a late result and cannot restart the old action', async () => {
  const result = Promise.withResolvers<unknown>()
  const jobs = createOnboardingJobs({
    directory: await directory(),
    harnessFor: () => ({
      ...harnessFor('claude-code'),
      runAction: async input => input.resultSchema.parse(await result.promise)
    })
  })
  const state = progress()
  await jobs.discoverIdeas(state)
  await jobs.cancelIdeas(state.runId!)
  result.resolve({ options })
  await Bun.sleep(10)
  expect((await jobs.discoverIdeas(state)).status).toBe('failed')
})
test('duplicate workspace requests create one workspace and submit one brief', async () => {
  const dir = await directory()
  let registered = 0,
    sends = 0
  const state: WorkspaceBuild = {
    ...progress(),
    operationId: crypto.randomUUID(),
    idea: { ...options[0], id: crypto.randomUUID() }
  }
  const jobs = createOnboardingJobs({
    directory: join(dir, 'jobs'),
    workspacesRoot: () => dir,
    provisionWorkspace: async path => {
      await Bun.write(join(path, '.keep'), '')
      return { skillsDir: path, scaffold: 'exists', installLogPath: '' }
    },
    getWorkspace: async () => null,
    registerWorkspace: async (path, input) => {
      registered++
      expect(path).toBe(join(dir, 'reading-list'))
      expect(input?.id).toBe('reading-list')
      return { id: input!.id!, addedAt: new Date().toISOString(), path, type: 'claude-code' }
    },
    harnessFor: () => ({
      ...harnessFor('claude-code'),
      authStatus: async () => ({ status: 'available' })
    }),
    publishEvent: () => {},
    saveSelectedSession: async () => true,
    sendWorkspaceMessage: async (_ws, input) => {
      sends++
      expect(input.content).toContain('Build the Moi workspace “Reading list”')
      expect(input.content).toContain('Font: serif')
      expect(input.content).toContain('Color: paper')
      expect(input.content).toContain('Saved articles')
      expect(input.content).toContain('## Views')
      expect(input.content).toContain('### Reading list\nUse view icon: book\nSaved articles')
      expect(input.content).toContain('### Notes\nUse view icon: file\nReading notes')
      expect(input.content).toContain('Search articles by title')
      expect(input.content).toContain('## Overview widgets')
      expect(input.content).toContain('Show unread count and open the reading list')
      expect(await getWorkspaceConfig(_ws.path)).toEqual({
        name: 'Reading list',
        icon: { type: 'glyph', value: 'book', background: 'theme' }
      })
      expect((await loadLayout(_ws.path)).theme).toMatchObject({ font: 'serif', color: 'paper' })
      expect(await Bun.file(join(_ws.path, 'onboarding-brief.md')).text()).toBe(input.content)
    }
  })
  await Promise.all([jobs.createFromIdea(state), jobs.createFromIdea(state)])
  const result = await settle(
    () => jobs.createFromIdea(state),
    value => value.status === 'done'
  )
  expect(result.workspaceId).toBe('reading-list')
  expect(result.sessionId).toBeTruthy()
  expect(sends).toBe(1)
  expect(registered).toBe(1)
  expect((await jobs.createFromIdea(state, true)).status).toBe('done')
  expect(sends).toBe(1)
})

test('restart reconciles an accepted first message without sending it twice', async () => {
  const dir = await directory(),
    root = join(dir, 'workspaces')
  const existingFile = join(root, 'reading-list', 'keep.txt')
  await Bun.write(existingFile, 'Existing workspace')
  const state: WorkspaceBuild = {
    ...progress(),
    operationId: crypto.randomUUID(),
    idea: { ...options[0], id: crypto.randomUUID() }
  }
  let sends = 0
  const deps = {
    directory: join(dir, 'jobs'),
    workspacesRoot: () => root,
    getWorkspace: async (id: string) =>
      id === 'reading-list-2'
        ? { id, path: join(dir, 'imported'), type: 'claude-code' as const, addedAt: '' }
        : null,
    provisionWorkspace: async (path: string) => {
      await Bun.write(join(path, '.keep'), '')
      return { skillsDir: path, scaffold: 'exists' as const, installLogPath: '' }
    },
    registerWorkspace: async (path: string, input?: { id?: string }) => ({
      id: input!.id!,
      path,
      type: 'claude-code' as const,
      addedAt: new Date().toISOString()
    }),
    publishEvent: () => {},
    saveSelectedSession: async () => true,
    harnessFor: () => ({
      ...harnessFor('claude-code'),
      authStatus: async () => ({ status: 'available' as const }),
      listSessions: async () => [
        { sessionId: 'native-session', summary: 'Tracker', lastModified: Date.now() }
      ],
      sessionEvents: async () => [
        {
          kind: 'turn' as const,
          turn: {
            id: 'turn',
            role: 'user' as const,
            origin: { kind: 'user-input' as const },
            parts: [{ type: 'text' as const, text: composeBuildBrief(state.idea) }]
          }
        }
      ]
    }),
    sendWorkspaceMessage: async () => {
      sends++
      throw new Error('Connection lost after provider accepted')
    }
  }
  const jobs = createOnboardingJobs(deps)
  await jobs.createFromIdea(state)
  // Read the persisted failure, then recreate the manager to simulate restart.
  for (let i = 0; i < 100; i++) {
    if ((await jobs.createFromIdea(state)).status === 'failed') break
    await Bun.sleep(5)
  }
  const workspacePath = join(root, 'reading-list-3')
  await setWorkspaceConfig(workspacePath, { name: 'Renamed by the user' })
  const restarted = createOnboardingJobs(deps)
  // Changes to the plan must not change the message used to reconcile an earlier send.
  const updated = {
    ...state,
    idea: { ...state.idea, name: 'New name', description: 'A revised plan' }
  }
  await restarted.createFromIdea(updated, true)
  const result = await settle(
    () => restarted.createFromIdea(state),
    value => value.status === 'done'
  )
  expect(result.sessionId).toBe('native-session')
  expect(result.workspaceId).toBe('reading-list-3')
  expect(sends).toBe(1)
  expect((await getWorkspaceConfig(workspacePath)).name).toBe('Renamed by the user')
  expect(await Bun.file(existingFile).text()).toBe('Existing workspace')
})

for (const type of ['claude-code', 'codex'] as const) {
  test(`discovery dispatches prompt and schema to ${type} and forwards cancellation`, async () => {
    let input: Pick<HarnessActionInput, 'prompt' | 'resultSchema' | 'signal'> | undefined
    let report: ((value: unknown) => Promise<void>) | undefined
    const result = Promise.withResolvers<unknown>()
    const jobs = createOnboardingJobs({
      directory: await directory(),
      harnessFor: selected => {
        expect(selected).toBe(type)
        return {
          ...harnessFor(type),
          runAction: async request => {
            expect(request.model).toBe('fast')
            input = request
            report = async value => {
              if (request.progressSchema && request.onProgress)
                await request.onProgress(request.progressSchema.parse(value))
            }
            return request.resultSchema.parse(await result.promise)
          }
        }
      }
    })
    const state = { ...progress(), harness: type }
    await jobs.discoverIdeas(state)
    await settle(
      () => jobs.discoverIdeas(state),
      () => input !== undefined
    )
    const dates = input!.prompt.match(
      /^Research dates \(UTC\): today (\d{4}-\d{2}-\d{2}); last 30 days start (\d{4}-\d{2}-\d{2}); last 60 days start (\d{4}-\d{2}-\d{2})\./
    )!
    expect(dates).not.toBeNull()
    expect(dates[1]).toBe(new Date().toISOString().slice(0, 10))
    expect(Date.parse(dates[1]!) - Date.parse(dates[2]!)).toBe(30 * 86_400_000)
    expect(Date.parse(dates[1]!) - Date.parse(dates[3]!)).toBe(60 * 86_400_000)
    expect(input!.prompt.slice(dates[0].length + 2)).toBe(
      await Bun.file(new URL('./prompt.md', import.meta.url)).text()
    )
    expect(input?.resultSchema).toBe(ideasSchema)
    expect(input?.signal.aborted).toBe(false)
    await report!({ message: 'Reading recent email' })
    expect((await jobs.discoverIdeas(state)).progress).toEqual({ message: 'Reading recent email' })
    await jobs.cancelIdeas(state.runId)
    expect(input?.signal.aborted).toBe(true)
    await report!({ message: 'Late update' })
    expect(await jobs.discoverIdeas(state)).toEqual({
      status: 'failed',
      error: 'Discovery cancelled'
    })
    result.resolve({ options })
    await Bun.sleep(10)
  })
}

test('unsupported actions fail without falling back to another harness', async () => {
  const jobs = createOnboardingJobs({
    directory: await directory(),
    harnessFor: () => ({ ...harnessFor('codex'), runAction: undefined })
  })
  const state = progress()
  const result = await jobs.discoverIdeas(state)
  expect(result).toEqual({
    status: 'failed',
    error: 'This agent does not support ephemeral actions'
  })
  expect(await jobs.discoverIdeas(state)).toEqual(result)
})

for (const failure of ['provider', 'invalid-output'] as const) {
  test(`discovery records ${failure} failures`, async () => {
    const jobs = createOnboardingJobs({
      directory: await directory(),
      harnessFor: () => ({
        ...harnessFor('codex'),
        runAction: async input => {
          if (failure === 'provider') throw new Error('Provider unavailable')
          return input.resultSchema.parse({ options: [] })
        }
      })
    })
    const state = progress()
    await jobs.discoverIdeas(state)
    const result = await settle(
      () => jobs.discoverIdeas(state),
      value => value.status === 'failed'
    )
    expect(result.error).toBeTruthy()
    expect(result.ideas).toBeUndefined()
    if (failure === 'provider') expect(result.error).toBe('Provider unavailable')
  })
}

test('old saved discovery results ask for fresh ideas without starting an action', async () => {
  const dir = await directory()
  const state = progress()
  await Bun.write(
    join(dir, `${state.runId}.json`),
    JSON.stringify({
      status: 'done',
      ideas: [{ id: crypto.randomUUID(), title: 'Old idea', brief: 'Free text' }]
    })
  )
  const jobs = createOnboardingJobs({
    directory: dir,
    harnessFor: () => {
      throw new Error('Must not run an action')
    }
  })
  expect(await jobs.discoverIdeas(state)).toEqual({
    status: 'failed',
    error: 'These ideas use an older format. Find ideas again'
  })
})
