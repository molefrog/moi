// Claude Code as a Harness. Thin wiring over this folder's modules — see
// ../types.ts for the contract and ../README.md for the architecture.
import { join } from 'node:path'

import type { DiscoveredWorkspace, McpServer } from '@/lib/types'

import type { Harness } from '../types'
import { getMcpStatus } from './mcp'
import { getClaudeModels } from './models'
import {
  SESSION_LIMITS,
  getCCDebugSnapshot,
  getCCRunningSessions,
  interruptCCSession,
  killAllCCSessions,
  restartWorkspaceSessions,
  sendCCMessage
} from './session'
import { getSessionEvents, getSessions, getSessionWorkspacePreview } from './sessions'

function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${m}m ${sec}s`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}

function fmtAgo(ts: number, now: number): string {
  const s = Math.round((now - ts) / 1000)
  if (s < 1) return 'now'
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s ago`
  return `${Math.floor(m / 60)}h ${m % 60}m ago`
}

// Discover directories with CC session history that aren't registered yet.
async function discoverWorkspaces(registeredPaths: Set<string>): Promise<DiscoveredWorkspace[]> {
  try {
    const { listSessions } = await import('@anthropic-ai/claude-agent-sdk')
    const sessions = await listSessions({})
    const { stat } = await import('node:fs/promises')
    const paths = new Set<string>()
    for (const s of sessions) {
      if (!s.cwd || registeredPaths.has(s.cwd)) continue
      try {
        const info = await stat(s.cwd)
        if (info.isDirectory()) paths.add(s.cwd)
      } catch {}
    }
    return [...paths].map(path => ({ path, type: 'claude-code' as const }))
  } catch {
    return []
  }
}

export const claudeCodeHarness: Harness = {
  id: 'claude-code',
  capabilities: {
    supportsStreaming: true,
    imagesInline: 'base64',
    liveModelSwitch: true,
    liveEffortSwitch: false, // construct-time; session.ts drains + rebuilds
    nativeUserEcho: false // streaming-input never echoes; the server synthesizes the turn
  },

  sendMessage: input => sendCCMessage(input),
  interrupt: (workspaceId, sessionId) => interruptCCSession(workspaceId, sessionId),
  runningSessions: () => getCCRunningSessions(),

  listSessions: ws => getSessions(ws.path),
  workspacePreview: (ws, includeFirstUserMessage) =>
    getSessionWorkspacePreview(ws.path, includeFirstUserMessage),
  sessionEvents: (ws, sessionId) => getSessionEvents(sessionId, ws.path),
  listModels: ws => getClaudeModels(ws.path),
  // The SDK's McpServerStatus is a superset of the UI's McpServer (extra
  // fields are ignored by the client) — pass it through unchanged.
  mcpStatus: async ws => (await getMcpStatus(ws.path, 'project')) as unknown as McpServer[],
  discoverWorkspaces,

  onEnvChanged: workspacePath => restartWorkspaceSessions(workspacePath),
  shutdown: () => killAllCCSessions(),
  skillsDir: workspaceRoot => join(workspaceRoot, '.claude', 'skills'),

  statusLines: now => {
    const cc = getCCDebugSnapshot()
    const busy = cc.sessions.filter(s => s.busy).length
    const lines = [
      `live CC sessions  ${cc.sessions.length}/${SESSION_LIMITS.maxLive}  ` +
        `(${busy} busy, ${cc.sessions.length - busy} idle, ${cc.aliases} alias${cc.aliases === 1 ? '' : 'es'}, ` +
        `idle TTL ${fmtDuration(SESSION_LIMITS.idleTtlMs)})`
    ]
    if (cc.sessions.length === 0) {
      lines.push('  (none held in memory — next message will resume from disk)')
      return lines
    }
    // Busiest / most-recently-active first.
    const sorted = [...cc.sessions].sort(
      (a, b) => Number(b.busy) - Number(a.busy) || b.lastActivityAt - a.lastActivityAt
    )
    for (const s of sorted) {
      const mark = s.busy ? '▶ busy' : s.closed ? '✗ closed' : '○ idle'
      const bits = [
        mark.padEnd(8),
        `ws=${s.workspaceId}`,
        `session=${s.sessionId}`,
        `model=${s.model ?? 'default'}`,
        `effort=${s.effort ?? 'default'}`,
        `stream=${s.stream ? 'on' : 'off'}`,
        `pending=${s.pendingTurns}`,
        `age=${fmtDuration(now - s.createdAt)}`,
        `lastActivity=${fmtAgo(s.lastActivityAt, now)}`
      ]
      if (s.desiredEffort !== s.effort) bits.push(`desiredEffort=${s.desiredEffort ?? 'default'}`)
      if (s.desiredStream !== s.stream) bits.push(`desiredStream=${s.desiredStream ? 'on' : 'off'}`)
      if (!s.busy && !s.hasIdleTimer) bits.push('(no idle timer)')
      let line = '  ' + bits.join('  ')
      if (s.lastUserText) line += `\n      last: ${JSON.stringify(s.lastUserText)}`
      lines.push(line)
    }
    return lines
  }
}
