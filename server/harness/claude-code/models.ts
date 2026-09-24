import { query, resolveSettings } from '@anthropic-ai/claude-agent-sdk'
import type { ModelInfo } from '@anthropic-ai/claude-agent-sdk'

import type { Model } from '@/lib/types'

import { requireHarnessExecutable } from '../executable'
import { type ClaudeCli, claudeCliKey, probeClaudeCli } from './cli'
import { claudeSpawnEnv } from './spawn-env'

// The metadata query needs a cwd; its catalog is cached across workspaces.
async function fetchClaudeModels(cwd: string, executable: string): Promise<ModelInfo[]> {
  const q = query({
    prompt: '',
    options: {
      cwd,
      pathToClaudeCodeExecutable: executable,
      persistSession: false,
      settingSources: ['user', 'project'],
      env: claudeSpawnEnv()
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

export function withClaudeFastModeDefault(
  models: readonly ModelInfo[],
  defaultFastMode: boolean
): Model[] {
  return models.map(model =>
    model.supportsFastMode ? { ...model, defaultFastMode } : { ...model }
  )
}

export async function getClaudeModels(cwd: string): Promise<Model[]> {
  const executable = requireHarnessExecutable('claude-code')
  const [models, settings] = await Promise.all([
    catalog.models(cwd, executable),
    resolveSettings({ cwd, settingSources: ['user', 'project'] })
  ])
  const defaultFastMode =
    settings.effective.fastModePerSessionOptIn === true
      ? false
      : settings.effective.fastMode === true
  return withClaudeFastModeDefault(models, defaultFastMode)
}
