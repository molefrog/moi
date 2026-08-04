// Is the `moi` CLI being run by a coding agent rather than a human at a
// terminal? Two tiers, following the sentry-cli SENTRY_PIPELINE lesson —
// announcement over sniffing:
//
// - MOI_AGENT=1 is moi's own announcement, injected into every agent session
//   the server spawns (Claude Code and Codex harnesses). Exact for
//   first-party agents — and necessary, because the Claude Code harness
//   deliberately strips CLAUDECODE from its children.
// - The rest are third-party markers set by agent runtimes in the shells
//   they spawn: Claude Code (CLAUDECODE), OpenAI Codex (CODEX_SANDBOX),
//   Cursor (CURSOR_TRACE_ID). Best-effort — absence proves nothing.
const AGENT_ENV_MARKERS = ['MOI_AGENT', 'CLAUDECODE', 'CODEX_SANDBOX', 'CURSOR_TRACE_ID']

export function isAgentCaller(env: Record<string, string | undefined> = process.env): boolean {
  return AGENT_ENV_MARKERS.some(marker => !!env[marker])
}
