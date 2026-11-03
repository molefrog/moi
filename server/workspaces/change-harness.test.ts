import '../api/index'
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as executable from '../harness/executable'
import { claudeCodeHarness } from '../harness/claude-code'
import { changeWorkspaceHarness } from './change-harness'
import { reserveWorkspaceOperation } from './harness-transition'
import {
  DEFAULT_REGISTRY_PATH,
  getWorkspace,
  listWorkspaces,
  registerWorkspace,
  setRegistryPath
} from './registry'
import {
  DEFAULT_WORKSPACE_STATE_ROOT,
  readWorkspaceState,
  setWorkspaceStateRoot,
  updateWorkspaceState
} from '../workspace-state'
let root: string
let restore: (() => void)[] = []
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'moi-switch-'))
  setRegistryPath(join(root, 'registry.json'))
  setWorkspaceStateRoot(join(root, 'state'))
  const stop = spyOn(claudeCodeHarness, 'stopWorkspace').mockImplementation(() => {})
  restore = [() => stop.mockRestore()]
})
afterEach(async () => {
  restore.forEach(fn => fn())
  setRegistryPath(DEFAULT_REGISTRY_PATH)
  setWorkspaceStateRoot(DEFAULT_WORKSPACE_STATE_ROOT)
  await rm(root, { recursive: true, force: true })
})
test('switches in place and preserves metadata while resetting selections and pending builds', async () => {
  const ws = await registerWorkspace(root, { type: 'claude-code', name: 'My workspace' })
  await updateWorkspaceState(ws, state => {
    state.selected.overview = 'old'
    state.pinnedSessionId = 'old'
    state.sessions.old = { config: { model: 'old-model' } }
    state.pendingViews.view = {
      requirements: 'A dashboard',
      status: 'failed',
      buildSessionId: 'old'
    }
  })
  const next = await changeWorkspaceHarness(ws, 'codex')
  expect(next).toMatchObject({ id: ws.id, path: root, name: ws.name, type: 'codex' })
  const state = await readWorkspaceState(ws)
  expect(state.selected).toEqual({})
  expect(state.pinnedSessionId).toBeUndefined()
  expect(state.sessions.old?.config?.model).toBe('old-model')
  expect(state.pendingViews.view).toEqual({ requirements: 'A dashboard', status: 'draft' })
  // A later choice wins even when its caller still holds the original registration.
  await changeWorkspaceHarness(ws, 'claude-code')
  expect((await getWorkspace(ws.id))?.type).toBe('claude-code')
  expect((await listWorkspaces()).map(entry => entry.id)).toEqual([ws.id])
})
test('rejects reserved startup without changing registration', async () => {
  const ws = await registerWorkspace(root, { type: 'claude-code' })
  const release = reserveWorkspaceOperation(ws.id)
  try {
    await expect(changeWorkspaceHarness(ws, 'codex')).rejects.toThrow('busy')
  } finally {
    release()
  }
  expect((await getWorkspace(ws.id))?.type).toBe('claude-code')
})
test('rejects provider-owned workspaces', async () => {
  const ws = await registerWorkspace(root, { type: 'hermes' })
  await expect(changeWorkspaceHarness(ws, 'codex')).rejects.toThrow('cannot be changed')
})
test('rejects active sessions', async () => {
  const ws = await registerWorkspace(root, { type: 'claude-code' })
  const active = spyOn(claudeCodeHarness, 'activeSessions').mockReturnValue([
    { workspaceId: ws.id, sessionId: 'running', activity: 'running' }
  ])
  try {
    await expect(changeWorkspaceHarness(ws, 'codex')).rejects.toThrow('finish')
  } finally {
    active.mockRestore()
  }
})

test('switches to an uninstalled agent so workspace setup can offer installation', async () => {
  const ws = await registerWorkspace(root, { type: 'claude-code' })
  const unavailable = spyOn(executable, 'findHarnessExecutable').mockReturnValue(null)
  try {
    const updated = await changeWorkspaceHarness(ws, 'codex')
    expect(updated.type).toBe('codex')
    expect((await getWorkspace(ws.id))?.type).toBe('codex')
  } finally {
    unavailable.mockRestore()
  }
})

test('restores selection when registration persistence fails', async () => {
  const registry = await import('./registry')
  const ws = await registerWorkspace(root, { type: 'claude-code' })
  await updateWorkspaceState(ws, state => {
    state.selected.overview = 'kept'
    state.pinnedSessionId = 'kept'
  })
  const save = spyOn(registry, 'updateWorkspaceHarness').mockRejectedValue(
    new Error('Disk failure')
  )
  try {
    await expect(changeWorkspaceHarness(ws, 'codex')).rejects.toThrow('Disk failure')
    expect((await getWorkspace(ws.id))?.type).toBe('claude-code')
    const state = await readWorkspaceState(ws)
    expect(state.selected.overview).toBe('kept')
    expect(state.pinnedSessionId).toBe('kept')
  } finally {
    save.mockRestore()
  }
})

test('restores session selections even when layout rollback also fails', async () => {
  const layout = await import('./layout')
  const ws = await registerWorkspace(root, { type: 'claude-code' })
  await updateWorkspaceState(ws, state => {
    state.selected.overview = 'kept'
    state.pinnedSessionId = 'kept'
  })
  const save = spyOn(layout, 'saveLayout').mockRejectedValue(new Error('Layout unavailable'))
  const log = spyOn(console, 'error').mockImplementation(() => {})
  try {
    await expect(changeWorkspaceHarness(ws, 'codex')).rejects.toThrow('Layout unavailable')
    const state = await readWorkspaceState(ws)
    expect(state.selected.overview).toBe('kept')
    expect(state.pinnedSessionId).toBe('kept')
    expect((await getWorkspace(ws.id))?.type).toBe('claude-code')
  } finally {
    save.mockRestore()
    log.mockRestore()
  }
})

test('prepares missing skills once, shares concurrent preparation, and retries failures', async () => {
  const { prepareWorkspaceHarness } = await import('./change-harness')
  const skills = await import('../skills/update')
  const template = await import('../skills/template')
  const ws = await registerWorkspace(root, { type: 'codex' })
  const status = spyOn(skills, 'getWorkspaceSkillsStatus').mockResolvedValue({
    skills: [{ name: 'moi-workspace', installed: null, bundled: '1.0.0' }],
    updateAvailable: true
  })
  const install = spyOn(template, 'installBundledSkills')
    .mockRejectedValueOnce(new Error('Install failed'))
    .mockResolvedValue(['moi-workspace'])
  try {
    await expect(prepareWorkspaceHarness(ws)).rejects.toThrow('Install failed')
    await Promise.all([prepareWorkspaceHarness(ws), prepareWorkspaceHarness(ws)])
    await prepareWorkspaceHarness(ws)
    expect(install).toHaveBeenCalledTimes(2)
    expect(status).toHaveBeenCalledTimes(2)
    expect(install).toHaveBeenLastCalledWith(join(root, '.agents', 'skills'))
  } finally {
    status.mockRestore()
    install.mockRestore()
  }
})
