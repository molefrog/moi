import { accessSync, constants, statSync } from 'node:fs'

import type { HarnessAvailability, WorkspaceType } from '@/lib/types'

import { cachedLoginShellPath, loginShellPath, mergeSearchPaths } from './shell-path'

type PathWorkspaceType = Extract<WorkspaceType, 'claude-code' | 'codex'>

type ExecutableConfig = {
  command: string
  unavailableReason: string
  // Absolute locations probed when the PATH lookup misses. PATH wins, so a
  // deliberately installed CLI is never shadowed by an app-bundled copy.
  fallbackPaths?: readonly string[]
}

const executableConfig: Record<PathWorkspaceType, ExecutableConfig> = {
  'claude-code': {
    command: 'claude',
    unavailableReason:
      'Run curl -fsSL https://claude.ai/install.sh | sh in your terminal to install Claude'
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
    unavailableReason:
      'Run curl -fsSL https://chatgpt.com/codex/install.sh | sh in your terminal to install Codex'
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
export function findHarnessExecutable(type: PathWorkspaceType, path?: string): string | null {
  const config = executableConfig[type]
  if (path !== undefined) return Bun.which(config.command, { PATH: path })
  return (
    Bun.which(config.command, {
      PATH: mergeSearchPaths(cachedLoginShellPath(), process.env.PATH)
    }) ?? firstExecutable(config.fallbackPaths ?? [])
  )
}

export function requireHarnessExecutable(type: PathWorkspaceType, path?: string): string {
  const executable = findHarnessExecutable(type, path)
  if (!executable) throw new Error(executableConfig[type].unavailableReason)
  return executable
}

export async function pathHarnessAvailability(
  type: PathWorkspaceType,
  path?: string
): Promise<HarnessAvailability> {
  // Availability is asked per request (and long after startup), but await the
  // probe anyway so the very first request can't report a false negative.
  if (path === undefined) await loginShellPath()
  return findHarnessExecutable(type, path)
    ? { available: true }
    : { available: false, reason: executableConfig[type].unavailableReason }
}
