import type { HarnessAvailability, WorkspaceType } from '@/lib/types'

type PathWorkspaceType = Extract<WorkspaceType, 'claude-code' | 'codex'>

const executableConfig: Record<PathWorkspaceType, { command: string; unavailableReason: string }> =
  {
    'claude-code': {
      command: 'claude',
      unavailableReason:
        'Run curl -fsSL https://claude.ai/install.sh | sh in your terminal to install Claude'
    },
    codex: {
      command: 'codex',
      unavailableReason:
        'Run curl -fsSL https://chatgpt.com/codex/install.sh | sh in your terminal to install Codex'
    }
  }

export function findHarnessExecutable(
  type: PathWorkspaceType,
  path = process.env.PATH
): string | null {
  return Bun.which(executableConfig[type].command, { PATH: path })
}

export function requireHarnessExecutable(type: PathWorkspaceType, path = process.env.PATH): string {
  const executable = findHarnessExecutable(type, path)
  if (!executable) throw new Error(executableConfig[type].unavailableReason)
  return executable
}

export function pathHarnessAvailability(
  type: PathWorkspaceType,
  path = process.env.PATH
): HarnessAvailability {
  return findHarnessExecutable(type, path)
    ? { available: true }
    : { available: false, reason: executableConfig[type].unavailableReason }
}
