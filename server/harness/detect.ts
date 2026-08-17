// Which harness owns a directory — the auto-detection behind `moi init`.
//
// Precedence is deliberate. Hermes profiles and OpenClaw agents are STRUCTURAL
// workspaces: the provider owns the path and hands us an agent id, so a match
// there is definitive. Codex and Claude Code only leave history behind, which
// says "this CLI ran here once", not "this directory belongs to it" — so they
// come last. Nothing matching means moi genuinely cannot tell, and `moi init`
// asks for `--harness` rather than guessing: each backend reads skills from a
// different directory, so a wrong guess installs them where the agent never
// looks.
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

import type { WorkspaceType } from '@/lib/types'

import { discoverCodexWorkspaces } from './codex/discovery'
import { type HermesProfile, discoverHermesProfiles } from './hermes/discovery'
import { type OpenClawAgent, discoverOpenClawAgents } from './openclaw/discovery'

// Harness names accepted by `--harness`, in the order they are listed to the
// user. Detection order is separate (see detectHarness).
export const HARNESS_TYPES: readonly WorkspaceType[] = [
  'claude-code',
  'codex',
  'hermes',
  'openclaw'
]

export const harnessLabel: Record<WorkspaceType, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
  hermes: 'Hermes',
  openclaw: 'OpenClaw'
}

export function isHarnessName(value: string): value is WorkspaceType {
  return (HARNESS_TYPES as readonly string[]).includes(value)
}

// The provider binding a registry entry carries for agent-owned workspaces
// (OpenClaw agents, Hermes profiles). Mirrors the fields registerWorkspace
// stores; plain directory harnesses have none.
export type DetectedAgent = {
  agentId: string
  name?: string
  isDefault: boolean
  lastRunAt?: string
}

export type HarnessDetection = {
  type: WorkspaceType
  agent?: DetectedAgent
  // What gave it away, as a noun phrase for the CLI's "Detected …" line.
  reason: string
}

// Injection seam: the real sources talk to a gateway, the filesystem and the
// agent SDK, so tests supply fakes instead of a provisioned machine.
export type DetectionSources = {
  hermesProfiles: () => Promise<HermesProfile[]>
  openclawAgents: () => Promise<OpenClawAgent[]>
  // Directories each CLI has run in, from its own session history.
  codexWorkspaces: () => Promise<string[]>
  claudeCodeWorkspaces: () => Promise<string[]>
  hasClaudeConfigDir: (path: string) => boolean
}

const defaultSources: DetectionSources = {
  hermesProfiles: discoverHermesProfiles,
  openclawAgents: discoverOpenClawAgents,
  codexWorkspaces: async () => (await discoverCodexWorkspaces(new Set())).map(c => c.path),
  // Lazy: the Claude Code harness pulls in the agent SDK, and this module is
  // imported by the CLI, whose startup pays for every static import.
  claudeCodeWorkspaces: async () => {
    const { claudeCodeHarness } = await import('./claude-code')
    const found = (await claudeCodeHarness.discoverWorkspaces?.(new Set())) ?? []
    return found.map(c => c.path)
  },
  hasClaudeConfigDir: path => existsSync(join(path, '.claude'))
}

// A provider being unreachable (gateway down, SDK throwing) is a miss, not a
// failure — detection falls through to the next candidate.
async function safely<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn()
  } catch {
    return fallback
  }
}

function detectionForProfile(profile: HermesProfile): HarnessDetection {
  return {
    type: 'hermes',
    agent: {
      agentId: profile.agentId,
      ...(profile.name ? { name: profile.name } : {}),
      isDefault: profile.isDefault
    },
    reason: `a Hermes profile workspace (${profile.agentId})`
  }
}

function detectionForAgent(agent: OpenClawAgent): HarnessDetection {
  return {
    type: 'openclaw',
    agent: {
      agentId: agent.agentId,
      ...(agent.name ? { name: agent.name } : {}),
      isDefault: agent.isDefault,
      ...(agent.lastRunAt ? { lastRunAt: agent.lastRunAt } : {})
    },
    reason: `an OpenClaw agent workspace (${agent.agentId}${agent.name ? ', ' + agent.name : ''})`
  }
}

export async function detectHarness(
  workspacePath: string,
  sources: Partial<DetectionSources> = {}
): Promise<HarnessDetection | null> {
  const src = { ...defaultSources, ...sources }
  const path = resolve(workspacePath)

  const profile = (await safely(src.hermesProfiles, [])).find(p => p.path === path)
  if (profile) return detectionForProfile(profile)

  const agent = (await safely(src.openclawAgents, [])).find(a => a.path === path)
  if (agent) return detectionForAgent(agent)

  if ((await safely(src.codexWorkspaces, [])).includes(path)) {
    return { type: 'codex', reason: 'Codex session history here' }
  }

  // Session history first, then the config directory: history means the CLI
  // actually ran here, while `.claude/` can be committed by someone else. Note
  // the history scan drops linked git worktrees, so a worktree is recognized
  // by its `.claude/` directory or not at all.
  if ((await safely(src.claudeCodeWorkspaces, [])).includes(path)) {
    return { type: 'claude-code', reason: 'Claude Code session history here' }
  }
  if (src.hasClaudeConfigDir(path)) {
    return { type: 'claude-code', reason: 'a .claude/ directory here' }
  }

  return null
}

// The agent/profile bound to a path for an explicitly chosen harness, so an
// overridden `moi init` still registers the provider metadata auto-detection
// would have found. Null for the directory-only harnesses, and for a provider
// that cannot confirm the path (gateway down, profile removed).
export async function agentBindingFor(
  type: WorkspaceType,
  workspacePath: string,
  sources: Partial<DetectionSources> = {}
): Promise<DetectedAgent | null> {
  const src = { ...defaultSources, ...sources }
  const path = resolve(workspacePath)

  if (type === 'hermes') {
    const profile = (await safely(src.hermesProfiles, [])).find(p => p.path === path)
    return profile ? (detectionForProfile(profile).agent ?? null) : null
  }
  if (type === 'openclaw') {
    const agent = (await safely(src.openclawAgents, [])).find(a => a.path === path)
    return agent ? (detectionForAgent(agent).agent ?? null) : null
  }
  return null
}
