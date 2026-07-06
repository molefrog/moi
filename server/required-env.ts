// The env "required" view aggregates `config.requiredEnv` declared by both
// widgets and views, each key mapped to the bundle ids that asked for it.
// Shared by the env API (api.ts) and the `moi env` CLI (cli-env.ts).
import { collectViewRequiredEnv } from './views'
import { collectRequiredEnv } from './widgets'

export async function requiredEnvFor(workspacePath: string): Promise<Record<string, string[]>> {
  const [widgets, views] = await Promise.all([
    collectRequiredEnv(workspacePath),
    collectViewRequiredEnv(workspacePath)
  ])
  const out: Record<string, string[]> = {}
  for (const map of [widgets, views]) {
    for (const [key, ids] of Object.entries(map)) {
      out[key] = [...(out[key] ?? []), ...ids]
    }
  }
  return out
}
