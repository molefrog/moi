import Conf from 'conf'

import type { AppSettings } from '@/lib/types'

import { DATA_DIR } from './data-dir'

// App-wide user settings, stored as `settings.json` in moi's data dir next to
// the workspace registry. Backed by `conf`: atomic writes, per-key JSON-schema
// validation, and migrations when the settings shape evolves. Adding a key
// means extending `AppSettings` (lib/types.ts) and the schema here — with a
// default, so GET /api/settings always returns a complete object — plus
// `API_UPDATABLE` if clients may change it.

export type AppSettingsPatch = Partial<AppSettings>

// Whitelist of fields the API may update. Type validation is NOT duplicated
// here — `saveAppSettings` validates the merged store against the conf schema
// before anything is written, so a bad value throws with nothing persisted.
const API_UPDATABLE = ['autoUpdateSkills'] as const satisfies readonly (keyof AppSettings)[]

// Pick the API-updatable fields out of an untrusted body; unknown keys are
// dropped. Values are intentionally unchecked — the conf schema rejects wrong
// types when the patch is saved.
export function pickAppSettingsPatch(body: Record<string, unknown>): AppSettingsPatch {
  const picked: Record<string, unknown> = {}
  for (const key of API_UPDATABLE) {
    if (body[key] !== undefined) picked[key] = body[key]
  }
  // Not yet schema-validated; saveAppSettings is the enforcement point.
  return picked as AppSettingsPatch
}

let _dir = DATA_DIR
let _store: Conf<AppSettings> | null = null

// Test seam: point the store at a scratch dir (mirrors setSessionConfigPath).
export function setAppSettingsDir(dir: string): void {
  _dir = dir
  _store = null
}

function store(): Conf<AppSettings> {
  _store ??= new Conf<AppSettings>({
    cwd: _dir,
    configName: 'settings',
    schema: {
      autoUpdateSkills: { type: 'boolean', default: false }
    }
  })
  return _store
}

export function getAppSettings(): AppSettings {
  return store().store
}

// Merge a partial settings object over the stored one and return the result.
// The object-form `set` validates the whole merged store against the schema
// before writing, so an invalid patch throws (`Config schema violation: …`)
// and persists nothing.
export function saveAppSettings(patch: AppSettingsPatch): AppSettings {
  const settings = store()
  if (Object.keys(patch).length > 0) settings.set(patch)
  return settings.store
}
