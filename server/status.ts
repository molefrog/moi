// Plain-text introspection of the running server, served at GET /status.
// A quick "peek into the process": connected tabs, the in-memory live-session
// registry (CC + OpenClaw), each session's busy/idle state + last message, and
// the functions-worker pool (one child process per workspace) — handy when a
// chat appears stuck (loader spinning) and you want to know whether the server
// still holds a live session for that thread, or when a widget's server call
// hangs and you want to see whether its worker is alive and what it has loaded.
import { CONTROL_PORT, PORT } from './constants'
import { debugEnabled } from './debug'
import { WORKER_LIMITS, type WorkerDebugInfo, getWorkersDebugSnapshot } from './functions'
import { allHarnesses } from './harness/registry'
import { tildify } from './registry'
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

function fmtMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}mb`
}

function workerLine(w: WorkerDebugInfo, now: number): string {
  // A worker with in-flight calls is busy; one still booting is spawning;
  // otherwise it's warm and waiting for its idle TTL.
  const mark = w.pending > 0 ? '▶ busy' : w.ready ? '○ warm' : '… spawning'
  let callsBit = `calls=${w.calls}`
  const problems: string[] = []
  if (w.errors > 0) problems.push(`${w.errors} error${w.errors === 1 ? '' : 's'}`)
  if (w.timeouts > 0) problems.push(`${w.timeouts} timeout${w.timeouts === 1 ? '' : 's'}`)
  if (problems.length > 0) callsBit += ` (${problems.join(', ')})`

  const bits = [
    mark.padEnd(10),
    `ws=${tildify(w.workspacePath)}`,
    `pid=${w.pid ?? '?'}`,
    callsBit,
    `pending=${w.pending}`,
    `age=${fmtDuration(now - w.spawnedAt)}`,
    `lastCall=${w.lastCallAt === null ? 'never' : fmtAgo(w.lastCallAt, now)}`,
    `reap=${w.ttlRemainingMs > 0 ? 'in ' + fmtDuration(w.ttlRemainingMs) : 'imminent'}`
  ]
  if (w.rssBytes !== null) bits.push(`rss=${fmtMb(w.rssBytes)}`)
  let line = '  ' + bits.join('  ')
  line += `\n      modules: ${w.modules.length > 0 ? w.modules.join(', ') : '(none loaded)'}`
  return line
}

export function renderStatus(): string {
  const now = Date.now()

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

  // One section per harness — each formats its own live-session view.
  for (const h of allHarnesses()) {
    const section = h.statusLines?.(now)
    if (!section?.length) continue
    lines.push(...section)
    lines.push('')
  }

  const workers = getWorkersDebugSnapshot()
  lines.push(
    `function workers  ${workers.length}/${WORKER_LIMITS.maxWorkers}  ` +
      `(one per workspace, idle TTL ${fmtDuration(WORKER_LIMITS.idleTtlMs)}, ` +
      `call timeout ${fmtDuration(WORKER_LIMITS.callTimeoutMs)})`
  )
  if (workers.length === 0) {
    lines.push('  (none running — spawned lazily on the first server-function call)')
  } else {
    // Busiest / most-recently-called first.
    const sorted = [...workers].sort(
      (a, b) => b.pending - a.pending || (b.lastCallAt ?? 0) - (a.lastCallAt ?? 0)
    )
    for (const w of sorted) lines.push(workerLine(w, now))
  }
  lines.push('')

  return lines.join('\n') + '\n'
}
