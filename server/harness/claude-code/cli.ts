// Identity of the `claude` CLI moi will spawn next: the resolved executable and
// the version it reports. Claude Code updates itself in place while moi keeps
// running (the auto-updater and `claude update` both swap the binary behind
// the same path), so anything derived from the CLI — the model catalog above
// all — has to be keyed by this identity rather than cached for the process
// lifetime. `claude --version` is a ~15ms spawn, cheap enough to run on every
// catalog request.

export type ClaudeCli = {
  executable: string
  // First line of `claude --version` (e.g. `2.1.263 (Claude Code)`), or null
  // when the probe failed or timed out.
  version: string | null
}

const VERSION_PROBE_TIMEOUT_MS = 5_000

// The CLI prints one line, `<semver> (Claude Code)`. Keep the whole line: it
// is only compared and displayed, never parsed further.
export function parseClaudeVersion(output: string): string | null {
  const line = output.split('\n').find(l => l.trim().length > 0)
  return line ? line.trim() : null
}

export function claudeCliKey(cli: ClaudeCli): string {
  return `${cli.executable}\n${cli.version ?? '?'}`
}

// Never throws: a probe that fails (missing file, non-zero exit, hang) yields
// `version: null` and the catalog decides what to do with that.
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
