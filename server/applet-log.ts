// Per-workspace, in-memory journal of applet runtime errors — the "feel" leg of
// the self-correction loop (docs/self-correction.md). The agent builds applets
// but never sees them run; this journal collects what breaks afterwards (module
// load failures, render crashes, window errors attributed to a bundle, RPC
// failures, standing build failures) so `moi debug logs` can answer "what's
// broken right now that I'd otherwise not know about?".
//
// Deliberately NOT observability: no persistence (a server restart starts
// clean — the journal describes the current runtime), no levels, bounded size.
// Entries hold the *standing* problems since each applet's last good build: a
// successful rebuild clears that applet's entries, because they describe a
// bundle that no longer exists.
import type { AppletKind, AppletLogEntry, AppletLogSource } from '@/lib/types'

const MAX_ENTRIES = 100
const MAX_MESSAGE_CHARS = 1000
const MAX_STACK_CHARS = 4000

// workspacePath -> entries, oldest → newest.
const journals = new Map<string, AppletLogEntry[]>()

export type AppletErrorInput = {
  source: AppletLogSource
  kind?: AppletKind
  name?: string
  module?: string
  fn?: string
  message: string
  stack?: string
}

// Identity for dedup: a repeat of the same error (same source + attribution +
// message) bumps `count` instead of appending. Stack is deliberately excluded —
// minified column drift would defeat the dedup.
function dedupKey(e: {
  source: string
  kind?: string
  name?: string
  module?: string
  fn?: string
  message: string
}): string {
  return [e.source, e.kind ?? '', e.name ?? '', e.module ?? '', e.fn ?? '', e.message].join('\0')
}

export function recordAppletError(workspacePath: string, input: AppletErrorInput): void {
  const entries = journals.get(workspacePath) ?? []
  const message = input.message.slice(0, MAX_MESSAGE_CHARS)
  const key = dedupKey({ ...input, message })

  const existingIdx = entries.findIndex(e => dedupKey(e) === key)
  if (existingIdx !== -1) {
    // Repeat: bump the counter, refresh the timestamp, move to the tail so the
    // journal stays ordered by last occurrence.
    const [existing] = entries.splice(existingIdx, 1)
    existing.count++
    existing.ts = Date.now()
    entries.push(existing)
  } else {
    entries.push({
      ts: Date.now(),
      source: input.source,
      ...(input.kind ? { kind: input.kind } : {}),
      ...(input.name ? { name: input.name } : {}),
      ...(input.module ? { module: input.module } : {}),
      ...(input.fn ? { fn: input.fn } : {}),
      message,
      ...(input.stack ? { stack: input.stack.slice(0, MAX_STACK_CHARS) } : {}),
      count: 1
    })
    if (entries.length > MAX_ENTRIES) entries.shift()
  }
  journals.set(workspacePath, entries)
}

// Snapshot, oldest → newest. Copies so callers can't mutate the journal.
export function getAppletLog(workspacePath: string): AppletLogEntry[] {
  return (journals.get(workspacePath) ?? []).map(e => ({ ...e }))
}

export function getAppletLogCount(workspacePath: string): number {
  return journals.get(workspacePath)?.length ?? 0
}

// Wipe the journal (`moi debug logs --clear`). Returns how many were dropped.
export function clearAppletLog(workspacePath: string): number {
  const count = getAppletLogCount(workspacePath)
  journals.delete(workspacePath)
  return count
}

// Attribute an RPC module key to its applet: `widgets/hello` → widget "hello",
// `views/crm` → view "crm". Shared modules (`lib/db`) attribute to nothing —
// the entry still carries `module`/`fn`.
export function appletForModule(module: string): { kind: AppletKind; name: string } | null {
  const m = module.match(/^(widgets|views)\/([^/]+)$/)
  if (!m) return null
  return { kind: m[1] === 'widgets' ? 'widget' : 'view', name: m[2] }
}

type BuildResultLike = {
  name: string
  status: 'built' | 'skipped' | 'failed'
  error?: string
  serverModules?: string[]
}

// Reconcile the journal with one kind's bundle results: a failure lands in the
// journal (so it stays on record turns later), a successful build clears the
// applet's standing entries — its browser-side errors describe a bundle that no
// longer exists — plus `rpc` entries for the server modules rebuilt with it.
// Every current source yields a result row (built/skipped/failed), so the
// result set doubles as the source list and entries for deleted applets are
// swept too.
export function syncAppletLogAfterBuild(
  workspacePath: string,
  kind: AppletKind,
  results: BuildResultLike[]
): void {
  const rebuiltModules = new Set<string>()
  const clearedNames = new Set<string>()
  const present = new Set(results.map(r => r.name))

  for (const r of results) {
    if (r.status === 'failed') {
      recordAppletError(workspacePath, {
        source: 'build',
        kind,
        name: r.name,
        message: r.error ?? 'Build failed'
      })
    }
    if (r.status === 'built') {
      clearedNames.add(r.name)
      for (const m of r.serverModules ?? []) rebuiltModules.add(m)
    }
  }

  const entries = journals.get(workspacePath)
  if (!entries) return
  const kept = entries.filter(e => {
    if (e.kind === kind && e.name && (clearedNames.has(e.name) || !present.has(e.name))) {
      return false
    }
    if (e.source === 'rpc' && e.module && rebuiltModules.has(e.module)) return false
    return true
  })
  journals.set(workspacePath, kept)
}
