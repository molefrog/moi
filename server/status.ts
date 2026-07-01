// Plain-text introspection of the running server, served at GET /status.
// A quick "peek into the process": connected tabs, the in-memory live-session
// registry (CC + OpenClaw), and each session's busy/idle state + last message —
// handy when a chat appears stuck (loader spinning) and you want to know whether
// the server still holds a live session for that thread and what it's doing.
import { type CCDebugSession, SESSION_LIMITS, getCCDebugSnapshot } from './cc-session'
import { CONTROL_PORT, PORT } from './constants'
import { debugEnabled } from './debug'
import { getOpenClawRunningSessions } from './openclaw-session'
import { getClientCount } from './state'

const STARTED_AT = Date.now()

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

function sessionLine(s: CCDebugSession, now: number): string {
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
  return line
}

export function renderStatus(): string {
  const now = Date.now()
  const cc = getCCDebugSnapshot()
  const openclawRunning = getOpenClawRunningSessions()

  const lines: string[] = []
  lines.push('moi server status')
  lines.push('=================')
  lines.push('')
  lines.push(`uptime          ${fmtDuration(now - STARTED_AT)}`)
  lines.push(`http port       ${PORT}`)
  lines.push(`control port    ${CONTROL_PORT}`)
  lines.push(`debug logging   ${debugEnabled ? 'on (--debug)' : 'off'}`)
  lines.push(`connected tabs  ${getClientCount()}`)
  lines.push('')

  const busy = cc.sessions.filter(s => s.busy).length
  lines.push(
    `live CC sessions  ${cc.sessions.length}/${SESSION_LIMITS.maxLive}  ` +
      `(${busy} busy, ${cc.sessions.length - busy} idle, ${cc.aliases} alias${cc.aliases === 1 ? '' : 'es'}, ` +
      `idle TTL ${fmtDuration(SESSION_LIMITS.idleTtlMs)})`
  )
  if (cc.sessions.length === 0) {
    lines.push('  (none held in memory — next message will resume from disk)')
  } else {
    // Busiest / most-recently-active first.
    const sorted = [...cc.sessions].sort(
      (a, b) => Number(b.busy) - Number(a.busy) || b.lastActivityAt - a.lastActivityAt
    )
    for (const s of sorted) lines.push(sessionLine(s, now))
  }
  lines.push('')

  lines.push(`live OpenClaw runs  ${openclawRunning.length}`)
  for (const r of openclawRunning) {
    lines.push(`  ▶ busy  ws=${r.workspaceId}  session=${r.sessionId}`)
  }
  lines.push('')

  return lines.join('\n') + '\n'
}
