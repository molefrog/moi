import { mkdir, rename, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { OnboardingJobResult, IdeaDiscovery, WorkspaceBuild } from '@/lib/onboarding'
import { discoveryProgressSchema } from '@/lib/onboarding'
import { DATA_DIR } from '../data-dir'
import { createdWorkspacesRoot } from '../app-config'
import { provisionWorkspace } from '../workspaces/init'
import { registerWorkspace } from '../workspaces/registry'
import { setWorkspaceConfig } from '../workspaces/config'
import { saveLayout } from '../workspaces/layout'
import { resolveWorkspaceTheme } from '@/lib/themes'
import { publishEvent } from '../events'
import { harnessFor } from '../harness/registry'
import { sendWorkspaceMessage } from '../sessions/view-sessions'
import { resolveRenamedSession, saveSelectedSession } from '../sessions/selected'
import { readWorkspaceState } from '../workspace-state'
import { ideasSchema, onboardingIdeaSchema, parseIdeas } from './ideas'
import { composeBuildBrief } from './brief'

type Job = OnboardingJobResult & {
  stage?: 'sending' | 'accepted'
}
const defaults = {
  directory: join(DATA_DIR, 'onboarding'),
  workspacesRoot: createdWorkspacesRoot,
  provisionWorkspace,
  registerWorkspace,
  setWorkspaceConfig,
  publishEvent,
  harnessFor,
  sendWorkspaceMessage,
  saveSelectedSession,
  resolveRenamedSession,
  readWorkspaceState
}
export function createOnboardingJobs(overrides: Partial<typeof defaults> = {}) {
  const deps = { ...defaults, ...overrides }
  const active = new Map<string, AbortController>()
  const locks = new Map<string, Promise<unknown>>()
  function pathFor(key: string) {
    return join(deps.directory, `${key}.json`)
  }
  async function read(key: string): Promise<Job | undefined> {
    // Read through one opened descriptor: a concurrent atomic rename must not
    // pair cached file-size metadata with the next version's contents.
    try {
      return JSON.parse(await readFile(pathFor(key), 'utf8')) as Job
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw error
    }
  }
  async function write(key: string, job: Job) {
    await mkdir(deps.directory, { recursive: true })
    const path = pathFor(key),
      temp = `${path}.${crypto.randomUUID()}.tmp`
    await Bun.write(temp, JSON.stringify(job))
    await rename(temp, path)
  }
  function locked<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const run = (locks.get(key) ?? Promise.resolve()).catch(() => {}).then(fn)
    locks.set(key, run)
    void run
      .finally(() => {
        if (locks.get(key) === run) locks.delete(key)
      })
      .catch(() => {})
    return run
  }
  async function cancelIdeas(id: string) {
    const key = id
    return locked(key, async () => {
      active.get(key)?.abort()
      await write(key, { status: 'failed', error: 'Discovery cancelled' })
    })
  }
  async function discoverIdeas(progress: IdeaDiscovery): Promise<Job> {
    if (!progress.runId || !progress.harness) throw new Error('Choose an agent first')
    const key = progress.runId
    return locked(key, async () => {
      const saved = await read(key)
      if (saved) {
        if (
          saved.status === 'done' &&
          !saved.ideas?.every(idea => onboardingIdeaSchema.safeParse(idea).success)
        )
          return { status: 'failed', error: 'These ideas use an older format. Find ideas again' }
        if (saved.status === 'running' && !active.has(key))
          return { status: 'failed', error: 'Discovery was interrupted. Try again' }
        return saved
      }
      const harness = deps.harnessFor(progress.harness)
      if (!harness.runAction) {
        const failed: Job = {
          status: 'failed',
          error: 'This agent does not support ephemeral actions'
        }
        await write(key, failed)
        return failed
      }
      const controller = new AbortController()
      active.set(key, controller)
      const initial: Job = { status: 'running' }
      try {
        await write(key, initial)
      } catch (error) {
        active.delete(key)
        throw error
      }
      const timeout = setTimeout(() => controller.abort(), 180_000)
      void Promise.resolve()
        .then(async () => {
          const now = Date.now()
          const dateAgo = (days: number) =>
            new Date(now - days * 86_400_000).toISOString().slice(0, 10)
          const dates = `Research dates (UTC): today ${dateAgo(0)}; last 30 days start ${dateAgo(30)}; last 60 days start ${dateAgo(60)}.`
          return harness.runAction!({
            prompt: `${dates}\n\n${await Bun.file(new URL('./prompt.md', import.meta.url)).text()}`,
            resultSchema: ideasSchema,
            progressSchema: discoveryProgressSchema,
            onProgress: update =>
              locked(key, async () => {
                const current = await read(key)
                if (!controller.signal.aborted && current?.status === 'running')
                  await write(key, { ...current, progress: update })
              }),
            signal: controller.signal
          })
        })
        .then(value => ({ status: 'done' as const, ideas: parseIdeas(value) }))
        .catch(error => ({
          status: 'failed' as const,
          error: controller.signal.aborted
            ? 'Discovery stopped. Try again'
            : String(error instanceof Error ? error.message : error)
        }))
        .then(result =>
          locked(key, async () => {
            if ((await read(key))?.status === 'running') await write(key, result)
          })
        )
        .finally(() => {
          clearTimeout(timeout)
          active.delete(key)
        })
        .catch(error => console.error('[onboarding] could not save action result', error))
      return initial
    })
  }

  async function createFromIdea(progress: WorkspaceBuild, retry = false): Promise<Job> {
    const key = progress.operationId
    return locked(key, async () => {
      const saved = await read(key)
      if (saved?.status === 'done' || active.has(key)) return saved!
      if (saved?.status === 'failed' && !retry) return saved
      const controller = new AbortController()
      active.set(key, controller)
      const initial: Job = {
        ...saved,
        status: 'running',
        error: undefined,
        sessionId: saved?.sessionId ?? crypto.randomUUID()
      }
      try {
        await write(key, initial)
      } catch (error) {
        active.delete(key)
        throw error
      }
      void build(key, progress, initial)
        .catch(async error => {
          await write(key, {
            ...(await read(key)),
            status: 'failed',
            error: error instanceof Error ? error.message : String(error)
          })
        })
        .finally(() => active.delete(key))
        .catch(error => console.error('[onboarding] could not save workspace result', error))
      return initial
    })
  }
  async function build(key: string, progress: WorkspaceBuild, job: Job) {
    const idea = progress.idea
    // The operation ID makes the directory stable across retries and
    // distinct from both other operations and user-chosen workspace names.
    const path = join(deps.workspacesRoot(), `onboarding-${key}`)
    await deps.provisionWorkspace(path, progress.harness)
    if (!job.workspaceId) {
      const layout = await deps.setWorkspaceConfig(path, {
        name: idea.name,
        icon: { type: 'glyph', value: idea.icon, background: 'theme' }
      })
      await saveLayout(
        { ...layout, theme: resolveWorkspaceTheme({ ...layout.theme, ...idea.theme }) },
        path
      )
    }
    const ws = await deps.registerWorkspace(path, { type: progress.harness, name: idea.name })
    job.workspaceId = ws.id
    await write(key, job)
    const briefPath = join(path, 'onboarding-brief.md')
    // Reconciliation must compare against the exact message originally submitted.
    const brief = job.stage ? await Bun.file(briefPath).text() : composeBuildBrief(idea)
    await Bun.write(briefPath, brief)
    deps.publishEvent({ type: 'workspaces-list:updated' })
    const harness = deps.harnessFor(ws)
    if (job.stage === 'sending' || job.stage === 'accepted') {
      // The provider may have accepted before a response/save was lost. This
      // workspace belongs to this operation; look for its initial user message.
      const sessions = await harness.listSessions(ws)
      for (const session of sessions) {
        const events = await harness.sessionEvents(ws, session.sessionId)
        if (
          events.some(
            event =>
              event.kind === 'turn' &&
              event.turn.role === 'user' &&
              event.turn.parts.some(part => part.type === 'text' && part.text.includes(brief))
          )
        ) {
          job.sessionId = session.sessionId
          await deps.saveSelectedSession(ws, session.sessionId)
          await write(key, { ...job, status: 'done', stage: 'accepted' })
          return
        }
      }
      const state = await deps.readWorkspaceState(ws)
      job.sessionId = state.selected.overview ?? job.sessionId
      if (harness.activeSessions().some(session => session.workspaceId === ws.id))
        throw new Error('The agent is still starting. Wait a moment and try again')
      // Absence from a transcript is not proof a send failed. Never replay an
      // ambiguous send automatically; the brief stays available in the workspace.
      if (job.stage === 'sending')
        throw new Error(
          'Could not confirm the first message. Check the chat before sending the saved onboarding brief'
        )
    }
    const availability = await harness.authStatus?.()
    if (availability && availability.status !== 'available')
      throw new Error('Reconnect the agent, then retry starting the workspace')
    await deps.saveSelectedSession(ws, job.sessionId!)
    job.stage = 'sending'
    await write(key, job)
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        deps.sendWorkspaceMessage(ws, {
          workspaceId: ws.id,
          workspacePath: ws.path,
          sessionId: job.sessionId!,
          isNew: true,
          content: brief,
          optimisticId: progress.operationId,
          context: { activeTab: { id: 'overview' } }
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error('Could not confirm the first message. Check the chat before retrying')
              ),
            90_000
          )
        })
      ])
    } finally {
      clearTimeout(timer)
    }
    job.sessionId = deps.resolveRenamedSession(ws.id, job.sessionId!)
    await deps.saveSelectedSession(ws, job.sessionId)
    await write(key, { ...job, status: 'done', stage: 'accepted' })
  }

  return { discoverIdeas, cancelIdeas, createFromIdea }
}
export const { discoverIdeas, cancelIdeas, createFromIdea } = createOnboardingJobs()
