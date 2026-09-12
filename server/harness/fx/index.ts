import { stat } from 'node:fs/promises'
import { join } from 'node:path'

import type { HarnessAvailability } from '@/lib/types'

import { resolveWorkspaceEnv } from '../../workspace-env'
import { archiveAcpSession } from '../acp/archived'
import { getAcpProcessInfo, killAcpWorkspace, killAllAcpClients } from '../acp/client'
import { acpWorkspacePreview, listAcpModels, listAcpSessions } from '../acp/discovery'
import { clearAcpModelCache } from '../acp/model-state'
import {
  type AcpProviderConfig,
  ensureAcpSessionLive,
  forgetAcpSession,
  forgetAcpWorkspaceSessions,
  forgetAllAcpSessions,
  getAcpActiveSessions,
  getLiveAcpEvents,
  interruptAcpRun,
  sendAcpMessage
} from '../acp/session'
import { findHarnessExecutable, pathHarnessAvailability } from '../executable'
import type { Harness } from '../types'
import { isFxOperationalMessage, normalizeFxToolUpdate } from './adapter'
import { applyFxSettings, fxModels, fxModelState } from './models'

export const fxConfig: AcpProviderConfig = {
  id: 'fx',
  provider: 'fx',
  processScope: 'session',
  // `code` uses fx's automatic action review; it does not disable review.
  noPromptModeId: 'code',
  supportsImages: true,
  modelState: fxModelState,
  mapModels: fxModels,
  defaultModel: async (ctx, config) =>
    (await listAcpModels(config, ctx)).find(model => model.value === 'default')?.resolvedModel,
  applySettings: applyFxSettings,
  normalizeToolUpdate: normalizeFxToolUpdate,
  isOperationalMessage: isFxOperationalMessage,
  async modelStateFingerprint(ctx) {
    const env = await resolveWorkspaceEnv(ctx.workspacePath)
    const home = env.HOME ?? process.env.HOME ?? ''
    const paths = [findHarnessExecutable('fx'), join(home, '.fx', 'settings.json')]
    const stamps = await Promise.all(
      paths.map(async path => {
        if (!path) return ''
        const entry = await stat(path).catch(() => undefined)
        return `${path}:${entry?.mtimeMs ?? 0}:${entry?.size ?? 0}`
      })
    )
    return stamps.join('|')
  },
  async spawn(ctx) {
    const command = findHarnessExecutable('fx')
    if (!command) throw new Error('fx executable not found')
    return {
      provider: 'fx',
      command,
      args: ['acp'],
      workspacePath: ctx.workspacePath,
      // Preserve the installed binary during an owned process's lifetime.
      env: { FX_AUTO_UPGRADE: '0' }
    }
  }
}

function ctxOf(ws: { id: string; path: string }) {
  return { workspaceId: ws.id, workspacePath: ws.path }
}

export const fxHarness: Harness = {
  id: 'fx',
  capabilities: {
    supportsStreaming: true,
    imagesInline: 'base64',
    liveModelSwitch: true,
    liveEffortSwitch: true,
    nativeUserEcho: false
  },
  sendMessage: input => sendAcpMessage(fxConfig, input),
  interrupt: (workspaceId, sessionId) => interruptAcpRun(fxConfig, { workspaceId, sessionId }),
  archiveSession: async (ws, sessionId) => {
    await interruptAcpRun(fxConfig, { workspaceId: ws.id, sessionId })
    await archiveAcpSession(ws.path, sessionId)
    forgetAcpSession(ws.id, sessionId)
  },
  activeSessions: () => getAcpActiveSessions('fx'),
  listSessions: ws => listAcpSessions(fxConfig, ctxOf(ws)),
  workspacePreview: (ws, firstMessage) => acpWorkspacePreview(fxConfig, ctxOf(ws), firstMessage),
  sessionEvents: async (ws, sessionId) =>
    getLiveAcpEvents(ws.id, sessionId) ??
    (await ensureAcpSessionLive(fxConfig, { ...ctxOf(ws), sessionId })),
  listModels: ws => listAcpModels(fxConfig, ctxOf(ws)),
  async availability(ws): Promise<HarnessAvailability> {
    const runtime = await pathHarnessAvailability('fx')
    if (runtime.status !== 'available' || !ws) return runtime
    const command = findHarnessExecutable('fx')
    if (!command) return runtime
    const workspaceEnv = await resolveWorkspaceEnv(ws.path)
    const proc = Bun.spawn([command, 'status'], {
      cwd: ws.path,
      env: { ...process.env, ...workspaceEnv, FX_AUTO_UPGRADE: '0' },
      stdout: 'pipe',
      stderr: 'pipe'
    })
    const timeout = setTimeout(() => proc.kill(), 10_000)
    try {
      const [output, , code] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited
      ])
      if (code !== 0)
        return {
          status: 'unavailable',
          reason: 'fx status failed. Run fx status in this workspace to check its setup.'
        }
      if (/build_revision=43c11dcc34a9\b/.test(output)) {
        return {
          status: 'unavailable',
          reason:
            'This fx build cannot restore tool history. Run fx upgrade to install version 0.0.9 or later.'
        }
      }
      if (
        /\bauth=(?:none|missing|not configured)\s*$/m.test(output) ||
        (/auth_expired=true/.test(output) && !/auth_refreshable=true/.test(output))
      ) {
        return {
          status: 'unavailable',
          reason: 'Sign in with fx login in your terminal, then reopen this chat.'
        }
      }
      return { status: 'available' }
    } finally {
      clearTimeout(timeout)
    }
  },
  onEnvChanged: workspacePath => {
    clearAcpModelCache(workspacePath, 'fx')
    forgetAcpWorkspaceSessions(workspacePath, 'fx')
    killAcpWorkspace(workspacePath, 'fx')
  },
  stopWorkspace: workspacePath => {
    forgetAcpWorkspaceSessions(workspacePath, 'fx')
    killAcpWorkspace(workspacePath, 'fx')
  },
  shutdown: () => {
    forgetAllAcpSessions('fx')
    killAllAcpClients('fx')
  },
  skillsDir: workspaceRoot => join(workspaceRoot, '.agents', 'skills'),
  debugInfo: ws => getAcpProcessInfo(ws.path, findHarnessExecutable('fx'), 'fx'),
  wireScope: ws => ws.path,
  statusLines: () => [
    `fx executable  ${findHarnessExecutable('fx') ?? '(not found)'}`,
    `live fx runs  ${getAcpActiveSessions('fx').length}`
  ]
}
