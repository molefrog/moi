import { resolve } from 'node:path'

import type { WorkspaceType } from '@/lib/types'

import { discoverHermesProfiles } from './harness/hermes/discovery'
import type { HermesProfile } from './harness/hermes/discovery'
import { discoverOpenClawAgents } from './harness/openclaw/discovery'
import type { OpenClawAgent } from './harness/openclaw/discovery'

export type WorkspaceImportMetadata = {
  name?: string
  agentId?: string
  isDefault?: boolean
  lastRunAt?: string
}

type DiscoverOpenClawAgents = () => Promise<OpenClawAgent[]>
type DiscoverHermesProfiles = () => Promise<HermesProfile[]>

function compareOpenClawAgents(a: OpenClawAgent, b: OpenClawAgent): number {
  if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1
  const byLastRun = (b.lastRunAt ?? '').localeCompare(a.lastRunAt ?? '')
  return byLastRun || a.agentId.localeCompare(b.agentId)
}

// A Hermes workspace belongs to a profile, so a UI import has to capture the
// same metadata `moi hermes init` does. Without it the entry has no agentId —
// every profile renders as a generic "Hermes agent" and the harness falls back
// to matching by path at spawn time.
async function resolveHermesImportMetadata(
  path: string,
  discoverProfiles: DiscoverHermesProfiles
): Promise<WorkspaceImportMetadata> {
  const normalizedPath = resolve(path)
  const profile = (await discoverProfiles()).find(
    candidate => resolve(candidate.path) === normalizedPath
  )

  if (!profile) {
    throw new Error('No Hermes profile owns this folder')
  }

  return {
    ...(profile.name ? { name: profile.name } : {}),
    agentId: profile.agentId,
    ...(profile.isDefault ? { isDefault: true } : {})
  }
}

export async function resolveWorkspaceImportMetadata(
  path: string,
  type: WorkspaceType,
  discoverAgents: DiscoverOpenClawAgents = discoverOpenClawAgents,
  discoverProfiles: DiscoverHermesProfiles = discoverHermesProfiles
): Promise<WorkspaceImportMetadata> {
  if (type === 'hermes') return resolveHermesImportMetadata(path, discoverProfiles)
  if (type !== 'openclaw') return {}

  const normalizedPath = resolve(path)
  const agent = (await discoverAgents())
    .filter(candidate => resolve(candidate.path) === normalizedPath)
    .sort(compareOpenClawAgents)[0]

  if (!agent) {
    throw new Error('OpenClaw is not initialized for this folder')
  }

  return {
    ...(agent.name ? { name: agent.name } : {}),
    agentId: agent.agentId,
    ...(agent.isDefault ? { isDefault: true } : {}),
    ...(agent.lastRunAt ? { lastRunAt: agent.lastRunAt } : {})
  }
}
