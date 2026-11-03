import { loadLayout, saveLayout } from './layout'
import type { WorkspaceEntry, WorkspaceType } from '@/lib/types'
import { harnessFor } from '../harness/registry'
import { harnessStore } from '../harness/auth'
import { getWorkspaceSkillsStatus } from '../skills/update'
import { publishEvent } from '../events'
import { updateWorkspaceState } from '../workspace-state'
import { getWorkspace, updateWorkspaceHarness } from './registry'
import { HarnessTransitionError, withHarnessTransition } from './harness-transition'
import { skillsDirFor } from './init'
import { installBundledSkills } from '../skills/template'

// Keep successful preparation for this server lifetime; failed attempts can retry.
const preparation = new Map<string, Promise<void>>()
export function prepareWorkspaceHarness(ws: WorkspaceEntry): Promise<void> {
  const key = `${ws.path}:${ws.type ?? 'claude-code'}`
  let pending = preparation.get(key)
  if (!pending) {
    pending = getWorkspaceSkillsStatus(ws.path, ws.type)
      .then(async status => {
        if (status.skills.some(skill => !skill.installed))
          await installBundledSkills(skillsDirFor(ws.path, ws.type))
      })
      .catch(error => {
        preparation.delete(key)
        throw error
      })
    preparation.set(key, pending)
  }
  return pending
}

export async function changeWorkspaceHarness(ws: WorkspaceEntry, type: WorkspaceType) {
  return withHarnessTransition(ws, async () => {
    const current = await getWorkspace(ws.id)
    if (!current) throw new HarnessTransitionError('Workspace not found')
    const previousType = current.type ?? 'claude-code'
    const harness = harnessFor(current)
    if (
      !['claude-code', 'codex'].includes(previousType) ||
      !['claude-code', 'codex'].includes(type)
    )
      throw new HarnessTransitionError('This workspace’s agent cannot be changed')
    if (type === previousType) return current
    if (harness.activeSessions().some(session => session.workspaceId === ws.id))
      throw new HarnessTransitionError('Wait for the agent to finish before changing it')
    const layoutBefore = await loadLayout(current.path)
    const before = await updateWorkspaceState(current, state => {
      const before = structuredClone(state)
      state.selected = {}
      delete state.pinnedSessionId
      for (const view of Object.values(state.pendingViews)) {
        delete view.buildSessionId
        view.status = 'draft'
        delete view.error
      }
      return before
    })
    let updated: WorkspaceEntry
    try {
      const layout = { ...layoutBefore }
      delete layout.selectedModel
      delete layout.selectedEffort
      delete layout.selectedFastMode
      await saveLayout(layout, current.path)
      updated = await updateWorkspaceHarness(ws.id, type)
    } catch (error) {
      const recovery = await Promise.allSettled([
        saveLayout(layoutBefore, current.path),
        updateWorkspaceState(current, state => Object.assign(state, before))
      ])
      for (const result of recovery) {
        if (result.status === 'rejected')
          console.error('Could not restore workspace state', result.reason)
      }
      throw error
    }
    // Capture and dispose the old runtime before allowing another transition.
    // stopWorkspace only signals local processes; it does not wait for their exit.
    try {
      harness.stopWorkspace?.(current.path)
    } catch (error) {
      console.error('Could not stop previous workspace runtime', error)
    }
    harnessStore.invalidate(current)
    publishEvent({ type: 'workspace-harness:changed', workspaceId: ws.id, harness: type })
    return updated
  })
}
