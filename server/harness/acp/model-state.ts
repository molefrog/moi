// Per-workspace model state (catalog + the backend's own default) for ACP
// backends. The state only ever arrives inline on `session/new`, so there is
// no standalone list RPC to poll: creating a session just to read models
// leaves a zero-history row in the agent's store (Hermes lists them as blank
// entries in `hermes sessions list`). The cache lets every real chat start
// keep the picker fresh for free, and a provider fingerprint (Hermes: config
// file mtimes) invalidates it when the default changes outside moi.
import type { AcpModelState } from './wire'

type Entry = {
  state: Promise<AcpModelState | undefined>
  // Opaque provider-supplied version of the inputs that shape the state. A
  // lookup with a different fingerprint is a miss; `undefined` on either side
  // matches anything, for backends with no external source to track.
  fingerprint?: string
}

const entries = new Map<string, Entry>()
const keyOf = (workspacePath: string, provider = 'hermes') =>
  JSON.stringify([provider, workspacePath])

export function peekAcpModelState(
  workspacePath: string,
  fingerprint?: string,
  provider = 'hermes'
): Promise<AcpModelState | undefined> | undefined {
  const entry = entries.get(keyOf(workspacePath, provider))
  if (!entry) return undefined
  if (
    fingerprint !== undefined &&
    entry.fingerprint !== undefined &&
    entry.fingerprint !== fingerprint
  )
    return undefined
  return entry.state
}

export function storeAcpModelState(
  workspacePath: string,
  state: Promise<AcpModelState | undefined>,
  fingerprint?: string,
  provider = 'hermes'
): void {
  entries.set(keyOf(workspacePath, provider), { state, fingerprint })
}

// Seed from a `session/new` moi made anyway. Empty catalogs are skipped so a
// degraded response cannot shadow a good one.
export function cacheAcpModelState(
  workspacePath: string,
  models: AcpModelState | null | undefined,
  fingerprint?: string,
  provider = 'hermes'
): void {
  if (models?.availableModels?.length) {
    const previous = entries.get(keyOf(workspacePath, provider))
    const state =
      previous && previous.fingerprint === fingerprint && models.configOptionsByModel
        ? previous.state.then(
            prior => {
              if (prior?.configOptionsScope !== models.configOptionsScope) return models
              // The latest observation replaces this model's full selector list,
              // including an empty list. Other models keep their known choices.
              const known = { ...prior?.configOptionsByModel, ...models.configOptionsByModel }
              return {
                ...models,
                configOptionsByModel: Object.fromEntries(
                  models.availableModels!.flatMap(model =>
                    known[model.modelId] ? [[model.modelId, known[model.modelId]]] : []
                  )
                )
              }
            },
            () => models
          )
        : Promise.resolve(models)
    storeAcpModelState(workspacePath, state, fingerprint, provider)
  }
}

export function clearAcpModelCache(workspacePath: string, provider?: string): void {
  if (provider) entries.delete(keyOf(workspacePath, provider))
  else
    for (const key of entries.keys()) {
      const [, path] = JSON.parse(key) as [string, string]
      if (path === workspacePath) entries.delete(key)
    }
}
