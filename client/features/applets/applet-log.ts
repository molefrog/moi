import { createRateLimiter } from '@/client/lib/rate-limit'
import type { AppletClientError, AppletKind } from '@/lib/types'

// Fire-and-forget reporter for browser-side applet errors — the client half of
// the applet error journal (docs/self-correction.md). Failures only the user's
// tab sees (module load failures, render crashes, window errors attributed to
// a bundle) are POSTed into the workspace journal so `moi debug logs` can show
// them to the agent. Always on: when the user says "it's broken", the crash
// their tab saw five minutes ago is already on record.
//
// Reporting must never hurt the app: fetch errors are swallowed, and the
// limiter bounds the network chatter. Its per-error cooldown collapses a crash
// loop of the SAME error into one POST per window; its window cap bounds the
// total regardless of message — an error whose text varies every occurrence
// (timestamps, ids) would defeat key-based cooldown and server dedup alike, and
// a tight throw loop must not become a POST-per-frame storm. Drops are silent
// here: the journal is best-effort diagnostics, not telemetry.
const limiter = createRateLimiter({ cooldownMs: 5_000, windowMs: 60_000, maxPerWindow: 30 })

export function reportAppletError(workspaceId: string, event: AppletClientError): void {
  const key = [workspaceId, event.source, event.kind, event.name, event.message].join('\0')
  if (limiter.admit(key) !== 'ok') return

  void fetch(`/api/workspaces/${workspaceId}/applet-log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events: [event] })
  }).catch(() => {})
}

// Attribute a window-level error to an applet by a bundle URL: applet bundles
// load from `/api/workspaces/<id>/(widgets|views)/<name>/…`, so any reference
// to one pins the error to that applet — and carries the workspace id along.
// Host-app URLs never match; their errors are not the journal's business.
// Matched against ErrorEvent.filename (a bare URL) and stack-trace text, where
// segments stop at `/`, whitespace, or `)` because stack frame formats differ
// per browser (Chrome parenthesizes URLs, Firefox uses `fn@url`).
const BUNDLE_URL_RE = /\/api\/workspaces\/([^/\s)]+)\/(widgets|views)\/([^/\s)]+)\//

type BundleRef = { workspaceId: string; kind: AppletKind; name: string }

// Exported for tests.
export function matchBundleUrl(text: string | undefined): BundleRef | null {
  if (!text) return null
  const m = BUNDLE_URL_RE.exec(text)
  if (!m) return null
  return { workspaceId: m[1], kind: m[2] === 'widgets' ? 'widget' : 'view', name: m[3] }
}

let installed = false

// Catch errors that escape React entirely — event handlers, async effects,
// unawaited promises — which no error boundary sees. Installed once at startup.
export function installAppletErrorHook(): void {
  if (installed) return
  installed = true

  const report = (ref: BundleRef | null, raw: unknown, fallbackMessage?: string) => {
    const err = raw instanceof Error ? raw : null
    const stack = err?.stack ?? ''
    const hit = ref ?? matchBundleUrl(stack)
    if (!hit) return
    reportAppletError(hit.workspaceId, {
      source: 'window',
      kind: hit.kind,
      name: hit.name,
      message: err?.message || fallbackMessage || String(raw),
      ...(stack ? { stack } : {})
    })
  }

  // Fast path for 'error' events: ErrorEvent.filename is the structured URL of
  // the script whose top frame threw — no stack-text parsing, no per-browser
  // format quirks, and it works even for throws with no usable stack
  // (`throw 'string'`). The stack scan remains the fallback (e.g. an applet
  // handler that threw inside vendor code, where filename names the vendor
  // chunk) and the only path for promise rejections, which carry no filename.
  window.addEventListener('error', e => report(matchBundleUrl(e.filename), e.error, e.message))
  window.addEventListener('unhandledrejection', e => report(null, e.reason))
}
