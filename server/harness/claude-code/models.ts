import { query, resolveSettings } from '@anthropic-ai/claude-agent-sdk'
import type { ModelInfo } from '@anthropic-ai/claude-agent-sdk'

import type { Model } from '@/lib/types'

import { requireHarnessExecutable } from '../executable'
import { type ClaudeCli, claudeCliKey, probeClaudeCli } from './cli'

// Chat runs live in `session.ts` (streaming-input sessions held per thread).
// MCP status probing lives in `mcp.ts`. This module only probes the agent
// backend for the model list — spins up a throwaway `query()` and reads metadata.

// Claude's available models come from the account/CLI, not the workspace, so
// the list is identical everywhere. We still need a `cwd` to spin up a probe
// query, but cache the result across workspaces.
async function fetchClaudeModels(cwd: string, executable: string): Promise<ModelInfo[]> {
  const q = query({
    prompt: '',
    options: {
      cwd,
      pathToClaudeCodeExecutable: executable,
      persistSession: false,
      settingSources: ['user', 'project'],
      env: { ...process.env, CLAUDECODE: undefined }
    }
  })
  const models = await q.supportedModels()
  await q.close()
  // Raw SDK shape, passed through to the client as-is.
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

// The catalog is a function of the CLI, so it is cached per CLI identity
// (`cli.ts`) rather than per process: Claude Code updates itself in place
// while moi runs, and a new release is what introduces new models. Every
// lookup re-probes `claude --version` (cheap) and refetches only when the
// identity moved; the same settled promise is shared by concurrent callers,
// and a failed fetch is dropped so a later request can retry instead of
// caching the rejection forever.
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

  // Fires after the catalog was invalidated by a CLI change (never on the
  // first fetch). Returns the unsubscribe function.
  function onCliChanged(listener: ClaudeCliChangeListener): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  // The identity the cached catalog was fetched for; undefined before the
  // first fetch. For status output — never a substitute for a fresh probe.
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
