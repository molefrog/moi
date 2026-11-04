import { query } from '@anthropic-ai/claude-agent-sdk'
import type { ModelInfo } from '@anthropic-ai/claude-agent-sdk'

import type { Model } from '@/lib/types'

import { claudeCodeSpawn } from '../../agent-launcher'
import { requireHarnessExecutable } from '../executable'
import { type ClaudeCli, claudeCliKey, probeClaudeCli } from './cli'

// The metadata query needs a cwd; its catalog is cached across workspaces.
async function fetchClaudeModels(cwd: string, executable: string): Promise<ModelInfo[]> {
  const q = query({
    prompt: '',
    options: {
      cwd,
      pathToClaudeCodeExecutable: executable,
      spawnClaudeCodeProcess: claudeCodeSpawn(),
      persistSession: false,
      settingSources: ['user', 'project'],
      env: { ...process.env, CLAUDECODE: undefined }
    }
  })
  const models = await q.supportedModels()
  await q.close()
  return models
}

export type ClaudeCliChangeListener = (next: ClaudeCli, previous: ClaudeCli) => void

export type ClaudeCatalogOptions = {
  probe: (executable: string) => Promise<ClaudeCli>
  fetch: (cwd: string, executable: string) => Promise<ModelInfo[]>
}

type CatalogEntry = {
  key: string
  cli: ClaudeCli
  models: Promise<ModelInfo[]>
}

// Recheck CLI identity on each lookup. Callers share the model-fetch promise
// until the identity changes; failed fetches are dropped so they can be retried.
export function createClaudeCatalog(options: ClaudeCatalogOptions) {
  let entry: CatalogEntry | null = null
  const listeners = new Set<ClaudeCliChangeListener>()

  function store(cli: ClaudeCli, cwd: string): Promise<ModelInfo[]> {
    const models = options.fetch(cwd, cli.executable).catch(err => {
      if (entry?.models === models) entry = null
      throw err
    })
    entry = { key: claudeCliKey(cli), cli, models }
    return models
  }

  async function models(cwd: string, executable: string): Promise<ModelInfo[]> {
    const cli = await options.probe(executable)
    const current = entry
    if (current) {
      if (current.key === claudeCliKey(cli)) return current.models
      // A failed version probe says nothing about the CLI. Keep serving the
      // catalog we have instead of re-spawning a probe query per request.
      if (cli.version === null && current.cli.executable === executable) return current.models
    }
    const next = store(cli, cwd)
    if (current) {
      console.log(
        `[claude-code] claude changed (${describe(current.cli)} → ${describe(cli)}); refreshing the model catalog`
      )
      for (const listener of listeners) listener(cli, current.cli)
    }
    return next
  }

  // Initial discovery is not a CLI change.
  function onCliChanged(listener: ClaudeCliChangeListener): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  // Cached identity for diagnostics; model lookups still need a fresh probe.
  function current(): ClaudeCli | undefined {
    return entry?.cli
  }

  return { models, onCliChanged, current }
}

function describe(cli: ClaudeCli): string {
  return `${cli.version ?? 'unknown version'} at ${cli.executable}`
}

const catalog = createClaudeCatalog({ probe: probeClaudeCli, fetch: fetchClaudeModels })

export const onClaudeCliChanged = catalog.onCliChanged
export const lastProbedClaudeCli = catalog.current

export async function getClaudeModels(cwd: string): Promise<Model[]> {
  return catalog.models(cwd, requireHarnessExecutable('claude-code'))
}
