import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { chmod, mkdtemp, rm } from 'node:fs/promises'

import { agentCommand } from '../agent-launcher'

export async function runHarnessCommand(input: {
  command: readonly string[]
  cwd: string
  stdin?: string
  signal: AbortSignal
  env?: Record<string, string | undefined>
}): Promise<string | null> {
  if (input.signal.aborted) return null
  try {
    const proc = Bun.spawn(agentCommand(input.command), {
      cwd: input.cwd,
      stdin: new Blob([input.stdin ?? '']),
      stdout: 'pipe',
      stderr: 'ignore',
      signal: input.signal,
      env: input.env,
      maxBuffer: 128 * 1024
    })
    const [exitCode, stdout] = await Promise.all([proc.exited, new Response(proc.stdout).text()])
    return exitCode === 0 && !input.signal.aborted ? stdout : null
  } catch {
    return null
  }
}

// On managed machines the command runs as the agent's user, which is
// neither the folder's owner nor in its group, so the folder is open to
// everyone: the agent works in it and Codex writes its answer there. It holds
// only temporary inputs and output for one run. Moi stays the owner, which is
// what lets it remove the folder from /tmp afterwards.
export async function createHarnessTempDir(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'moi-harness-'))
  await chmod(path, 0o777)
  return path
}

export async function removeHarnessTempDir(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true })
}
