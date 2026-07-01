// Opt-in messaging trace for the chat/session pipeline. Enabled by
// `moi start --debug` (which sets MOI_DEBUG=1 on the server child). Intentionally
// undocumented — a quick console peek for when a turn appears to hang (loader
// spins forever): you can watch the message land, the session create/resume, the
// turn start, and the `result` that should clear the spinner. No-op unless set.
export const debugEnabled = !!process.env.MOI_DEBUG

export function debug(...args: unknown[]): void {
  if (debugEnabled) console.log('\x1b[2m[debug]\x1b[0m', ...args)
}
