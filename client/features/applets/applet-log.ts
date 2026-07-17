import type { AppletClientError } from '@/lib/types'

// Fire-and-forget reporter for browser-side applet errors — the client half of
// the applet error journal (docs/self-correction.md). Failures only the user's
// tab sees (module load failures, render crashes, window errors attributed to
// a bundle) are POSTed into the workspace journal so `moi debug logs` can show
// them to the agent. Always on: when the user says "it's broken", the crash
// their tab saw five minutes ago is already on record.
//
// Reporting must never hurt the app: fetch errors are swallowed, and a
// per-error cooldown keeps a crash loop from turning into a POST storm (the
// server dedups identical errors too — this just spares the network).
const COOLDOWN_MS = 5_000
const lastSent = new Map<string, number>()

export function reportAppletError(workspaceId: string, event: AppletClientError): void {
  const key = [workspaceId, event.source, event.kind, event.name, event.message].join('\0')
  const now = Date.now()
  const last = lastSent.get(key)
  if (last !== undefined && now - last < COOLDOWN_MS) return
  lastSent.set(key, now)
  // Bound the cooldown map: drop the oldest half if it ever balloons.
  if (lastSent.size > 256) {
    for (const k of [...lastSent.keys()].slice(0, 128)) lastSent.delete(k)
  }
  void fetch(`/api/workspaces/${workspaceId}/applet-log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events: [event] })
  }).catch(() => {})
}

// Attribute a window-level error to an applet by the bundle URL in its stack:
// applet bundles load from `/api/workspaces/<id>/(widgets|views)/<name>/…`, so
// any frame from one pins the error to that applet — and carries the workspace
// id along. Host-app errors never match; they are not the journal's business.
const BUNDLE_URL_RE = /\/api\/workspaces\/([^/\s)]+)\/(widgets|views)\/([^/\s)]+)\//

let installed = false

// Catch errors that escape React entirely — event handlers, async effects,
// unawaited promises — which no error boundary sees. Installed once at startup.
export function installAppletErrorHook(): void {
  if (installed) return
  installed = true

  const report = (raw: unknown) => {
    const err = raw instanceof Error ? raw : null
    const stack = err?.stack ?? ''
    const m = BUNDLE_URL_RE.exec(stack)
    if (!m) return
    const [, workspaceId, segment, name] = m
    reportAppletError(workspaceId, {
      source: 'window',
      kind: segment === 'widgets' ? 'widget' : 'view',
      name,
      message: err?.message || String(raw),
      stack
    })
  }

  window.addEventListener('error', e => report(e.error))
  window.addEventListener('unhandledrejection', e => report(e.reason))
}
