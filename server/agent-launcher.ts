// Managed machines run moi and the agent as different OS users (see
// docs/config.md). `agentLauncher` in config.json names an executable
// that every agent process starts through: it switches to the agent's user,
// drops moi's powers, then execs the command. That covers harness CLIs,
// function workers, applet builds and dependency installs. Unset (every local
// install) spawns directly, exactly as before.
import { spawn } from 'node:child_process'

import type { Options } from '@anthropic-ai/claude-agent-sdk'

import { getAppConfig } from './app-config'

export function agentCommand(argv: readonly string[]): string[] {
  const launcher = getAppConfig().agentLauncher
  return launcher ? [launcher, ...argv] : [...argv]
}

// Claude Code is started by the Agent SDK rather than by moi, so it goes
// through the launcher via the SDK's spawn hook. Undefined keeps the SDK's own
// spawn. stderr is inherited: the hook's process type has no stderr stream for
// the SDK to drain.
export function claudeCodeSpawn(): Options['spawnClaudeCodeProcess'] {
  const launcher = getAppConfig().agentLauncher
  if (!launcher) return undefined
  return ({ command, args, cwd, env, signal }) =>
    spawn(launcher, [command, ...args], { cwd, env, signal, stdio: ['pipe', 'pipe', 'inherit'] })
}
