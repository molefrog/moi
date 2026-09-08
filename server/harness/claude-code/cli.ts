// Include the version in CLI identity: auto-updates can replace the binary
// without changing its path.

export type ClaudeCli = {
  executable: string
  // First line of `claude --version` (e.g. `2.1.263 (Claude Code)`), or null
  // when the probe failed or timed out.
  version: string | null
}

const VERSION_PROBE_TIMEOUT_MS = 5_000

// Keep the reported line intact for identity comparisons and status output.
export function parseClaudeVersion(output: string): string | null {
  const line = output.split('\n').find(l => l.trim().length > 0)
  return line ? line.trim() : null
}

export function claudeCliKey(cli: ClaudeCli): string {
  return `${cli.executable}\n${cli.version ?? '?'}`
}

// Probe failures yield an unknown version so callers can retain cached data.
export async function probeClaudeCli(executable: string): Promise<ClaudeCli> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    const proc = Bun.spawn([executable, '--version'], {
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'ignore'
    })
    timeout = setTimeout(() => proc.kill(), VERSION_PROBE_TIMEOUT_MS)
    const [output, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited])
    return { executable, version: exitCode === 0 ? parseClaudeVersion(output) : null }
  } catch {
    return { executable, version: null }
  } finally {
    clearTimeout(timeout)
  }
}
