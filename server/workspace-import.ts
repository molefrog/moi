import { resolve } from 'node:path'

import type { WorkspaceType } from '@/lib/types'

import { discoverOpenClawAgents } from './harness/openclaw/discovery'
import type { OpenClawAgent } from './harness/openclaw/discovery'

export type WorkspaceImportMetadata = {
  name?: string
  agentId?: string
  isDefault?: boolean
  lastRunAt?: string
}

type DiscoverOpenClawAgents = () => Promise<OpenClawAgent[]>

function compareOpenClawAgents(a: OpenClawAgent, b: OpenClawAgent): number {
  if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1
  const byLastRun = (b.lastRunAt ?? '').localeCompare(a.lastRunAt ?? '')
  return byLastRun || a.agentId.localeCompare(b.agentId)
}

export async function resolveWorkspaceImportMetadata(
  path: string,
  type: WorkspaceType,
  discoverAgents: DiscoverOpenClawAgents = discoverOpenClawAgents
): Promise<WorkspaceImportMetadata> {
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
