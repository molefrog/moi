// One-shot compile worker behind `buildAppletsEphemeral` (../applets.ts): runs
// one `buildApplets` batch in a FRESH process, reports the JSON result over
// IPC, and dies.
//
// It exists because Bun's module resolver caches FAILED bare-specifier lookups
// for the life of the process — nothing invalidates the negative entry, not
// even installing the package (verified on Bun 1.3.11; `Bun.resolveSync` shares
// the same cache, see the resolver notes in applets.ts). An in-process build in
// the long-running server would therefore keep failing with `Could not resolve:
// "x". Maybe you need to "bun install"?` forever after ONE failed build — even
// though the agent just ran `bun add x`, and the only cure would be a server
// restart the agent is told not to touch. A fresh process per compile batch
// always sees the node_modules actually on disk.
import { type EphemeralBundleReply, buildApplets } from '../applets'
import type { AppletKind } from './build-applet'

function send(reply: EphemeralBundleReply): void {
  process.send?.(reply)
}

let payload: { workspacePath?: unknown; kind?: unknown; force?: unknown } = {}
try {
  payload = JSON.parse(process.argv[2] ?? '{}')
} catch {
  // Malformed argv falls through to the missing-workspace error below.
}

const workspacePath = typeof payload.workspacePath === 'string' ? payload.workspacePath : null
const kind: AppletKind = payload.kind === 'view' ? 'view' : 'widget'

if (!workspacePath) {
  send({ type: 'error', message: 'bundle worker started without a workspace path' })
} else {
  try {
    const result = await buildApplets(workspacePath, kind, payload.force === true)
    send({ type: 'result', result })
  } catch (err) {
    send({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}

// The host kills the worker as soon as the reply lands; this backstop only
// keeps an orphan (host gone mid-build) from lingering.
setTimeout(() => process.exit(0), 5_000)
