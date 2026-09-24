// What the installed `claude` accepts, asked of the CLI itself rather than
// compared against a version floor: the changelog does not date when `auto`
// arrived and the Agent SDK declares no minimum, so the only honest source is
// the binary's own `--help`.
import type { HarnessAvailability } from '@/lib/types'

import { requireHarnessExecutable } from '../executable'
import { type ClaudeCli, claudeCliKey, probeClaudeCli } from './cli'

const HELP_PROBE_TIMEOUT_MS = 5_000

export type ClaudeCapabilities = {
  // `null` when the probe failed or the help text could not be read: unknown
  // never blocks a send.
  autoPermissionMode: boolean | null
}

export const UNKNOWN_CLAUDE_CAPABILITIES: ClaudeCapabilities = { autoPermissionMode: null }

// `claude --help` lists the accepted values inline, wrapped across lines:
//
//   --permission-mode <mode>   Permission mode to use for the session
//                              (choices: "acceptEdits", "auto",
//                              "bypassPermissions", "manual", "dontAsk", "plan")
//
// Returns null when the flag or its choices are absent, so an unreadable help
// text stays unknown instead of reading as "auto is unsupported".
export function parsePermissionModes(help: string): string[] | null {
  const flag = help.indexOf('--permission-mode')
  if (flag === -1) return null
  const start = help.indexOf('(choices:', flag)
  if (start === -1) return null
  const end = help.indexOf(')', start)
  if (end === -1) return null
  const modes = [...help.slice(start, end).matchAll(/"([^"]+)"/g)].map(match => match[1] as string)
  return modes.length > 0 ? modes : null
}

export function parseAutoPermissionMode(help: string): boolean | null {
  const modes = parsePermissionModes(help)
  return modes ? modes.includes('auto') : null
}

export async function probeClaudeCapabilities(executable: string): Promise<ClaudeCapabilities> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    const proc = Bun.spawn([executable, '--help'], {
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'ignore',
      env: { ...process.env, CLAUDECODE: undefined }
    })
    timeout = setTimeout(() => proc.kill(), HELP_PROBE_TIMEOUT_MS)
    const [output, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited])
    if (exitCode !== 0) return UNKNOWN_CLAUDE_CAPABILITIES
    return { autoPermissionMode: parseAutoPermissionMode(output) }
  } catch {
    return UNKNOWN_CLAUDE_CAPABILITIES
  } finally {
    clearTimeout(timeout)
  }
}

export type ClaudeCapabilityCacheOptions = {
  probe: (executable: string) => Promise<ClaudeCli>
  inspect: (executable: string) => Promise<ClaudeCapabilities>
}

export type ProbedClaudeCapabilities = {
  cli: ClaudeCli
  capabilities: ClaudeCapabilities
}

type CapabilityEntry = {
  key: string
  cli: ClaudeCli
  capabilities: Promise<ClaudeCapabilities>
  // Settled value, for the synchronous diagnostics read.
  settled?: ClaudeCapabilities
}

// One `--help` spawn per CLI identity, the same shape the model catalog uses:
// re-probe the identity on every lookup, reuse the cached answer while it
// matches, and keep the cached answer when the version probe itself fails.
export function createClaudeCapabilityCache(options: ClaudeCapabilityCacheOptions) {
  let entry: CapabilityEntry | null = null

  function store(cli: ClaudeCli): CapabilityEntry {
    const capabilities = options.inspect(cli.executable).catch(err => {
      if (entry?.capabilities === capabilities) entry = null
      throw err
    })
    const next: CapabilityEntry = { key: claudeCliKey(cli), cli, capabilities }
    entry = next
    return next
  }

  async function settle(current: CapabilityEntry): Promise<ProbedClaudeCapabilities> {
    const capabilities = await current.capabilities
    current.settled = capabilities
    return { cli: current.cli, capabilities }
  }

  async function get(executable: string): Promise<ProbedClaudeCapabilities> {
    const cli = await options.probe(executable)
    const current = entry
    if (current) {
      if (current.key === claudeCliKey(cli)) return settle(current)
      // A failed version probe says nothing about the CLI: keep the answer we
      // already have instead of spawning another `--help`.
      if (cli.version === null && current.cli.executable === executable) return settle(current)
    }
    return settle(store(cli))
  }

  // Cached answer for diagnostics; availability checks still need `get`.
  function current(): ClaudeCapabilities | undefined {
    return entry?.settled
  }

  return { get, current }
}

const capabilities = createClaudeCapabilityCache({
  probe: probeClaudeCli,
  inspect: probeClaudeCapabilities
})

export const lastProbedClaudeCapabilities = capabilities.current

function versionLabel(cli: ClaudeCli): string {
  const version = cli.version?.split(/\s+/)[0]
  return version ? `Claude Code ${version}` : 'This Claude Code'
}

export function autoPermissionsAvailability(
  probed: ProbedClaudeCapabilities
): HarnessAvailability | null {
  if (probed.capabilities.autoPermissionMode !== false) return null
  return {
    status: 'unavailable',
    reason: `${versionLabel(probed.cli)} doesn't support auto permissions. Run claude update`
  }
}

// A CLI that cannot report its capabilities is not a CLI we block.
export async function getClaudeAutoPermissionsReadiness(): Promise<HarnessAvailability | null> {
  try {
    return autoPermissionsAvailability(
      await capabilities.get(requireHarnessExecutable('claude-code'))
    )
  } catch {
    return null
  }
}
