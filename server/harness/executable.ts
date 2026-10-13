import { accessSync, constants, statSync } from 'node:fs'
import { delimiter, join, resolve } from 'node:path'

import { harnessInstructionMessage } from '@/lib/harness-instructions'
import type { HarnessAvailability, HarnessInstallations, WorkspaceType } from '@/lib/types'

import { cachedLoginShellPath, loginShellPath, mergeSearchPaths } from './shell-path'

const MOI_BIN_DIR = join(import.meta.dir, '..', '..', 'node_modules', '.bin')

type ExecutableConfig = {
  command: string
  unavailableReason: string
  // Absolute locations probed when the PATH lookup misses. PATH wins, so a
  // deliberately installed CLI is never shadowed by an app-bundled copy.
  fallbackPaths?: readonly string[]
}

const executableConfig: Record<WorkspaceType, ExecutableConfig> = {
  'claude-code': {
    command: 'claude',
    unavailableReason: harnessInstructionMessage('claude-code')
  },
  codex: {
    command: 'codex',
    // Codex Desktop manages an app-internal binary and does not put `codex`
    // on PATH: probe the known macOS bundle locations (ChatGPT.app is the
    // current home, Codex.app the legacy standalone install).
    fallbackPaths: [
      '/Applications/ChatGPT.app/Contents/Resources/codex',
      '/Applications/Codex.app/Contents/Resources/codex'
    ],
    unavailableReason: harnessInstructionMessage('codex')
  },
  openclaw: {
    command: 'openclaw',
    unavailableReason: 'OpenClaw is not installed'
  },
  hermes: {
    command: 'hermes',
    // The installer symlinks `hermes` into ~/.local/bin (per-user) or
    // /usr/local/bin (root), neither of which is guaranteed to be on a GUI
    // app's PATH; the venv entry point is the last resort.
    fallbackPaths: [
      `${process.env.HOME ?? ''}/.local/bin/hermes`,
      '/usr/local/bin/hermes',
      `${process.env.HOME ?? ''}/.hermes/hermes-agent/venv/bin/hermes`,
      '/usr/local/lib/hermes-agent/venv/bin/hermes'
    ],
    unavailableReason:
      'Run in terminal to install Hermes: curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash'
  }
}

// Resolve the login-shell PATH eagerly so sync lookups on the spawn path see
// it settled long before the first session starts.
void loginShellPath()

function isExecutableFile(path: string): boolean {
  try {
    accessSync(path, constants.X_OK)
    return statSync(path).isFile()
  } catch {
    return false
  }
}

export function firstExecutable(paths: readonly string[]): string | null {
  return paths.find(isExecutableFile) ?? null
}

// `path` is a test seam: when given, only that PATH is searched — no
// login-shell merge, no bundle fallbacks.
export function findHarnessExecutable(type: WorkspaceType, path?: string): string | null {
  const config = executableConfig[type]
  // bun run adds our dependency commands to PATH; those are not user installs.
  const searchPath = (path ?? mergeSearchPaths(cachedLoginShellPath(), process.env.PATH))
    .split(delimiter)
    .filter(directory => directory && resolve(directory) !== MOI_BIN_DIR)
    .join(delimiter)
  const executable = Bun.which(config.command, { PATH: searchPath })
  return path !== undefined
    ? executable
    : (executable ?? firstExecutable(config.fallbackPaths ?? []))
}

export function requireHarnessExecutable(type: WorkspaceType, path?: string): string {
  const executable = findHarnessExecutable(type, path)
  if (!executable) throw new Error(executableConfig[type].unavailableReason)
  return executable
}

export async function pathHarnessAvailability(
  type: WorkspaceType,
  path?: string
): Promise<HarnessAvailability> {
  // Availability is asked per request (and long after startup), but await the
  // probe anyway so the very first request can't report a false negative.
  if (path === undefined) await loginShellPath()
  return findHarnessExecutable(type, path)
    ? { status: 'available' }
    : { status: 'unavailable', reason: executableConfig[type].unavailableReason }
}

// Setup needs installation facts independently of auth, profiles, or gateway
// connectivity. Refresh the shell PATH to pick up installations made since
// the server started. A supplied PATH keeps tests independent of the host.
export async function detectInstalledHarnesses(path?: string): Promise<HarnessInstallations> {
  if (path === undefined) await loginShellPath({ refresh: true })
  return {
    'claude-code': Boolean(findHarnessExecutable('claude-code', path)),
    codex: Boolean(findHarnessExecutable('codex', path)),
    openclaw: Boolean(findHarnessExecutable('openclaw', path)),
    hermes: Boolean(findHarnessExecutable('hermes', path))
  }
}
