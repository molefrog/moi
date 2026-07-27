import Conf from 'conf'

import type { AppSettings } from '@/lib/types'

import { DATA_DIR } from './data-dir'

// App-wide user settings, stored as `settings.json` in moi's data dir next to
// the workspace registry. Backed by `conf`: atomic writes, per-key JSON-schema
// validation, and migrations when the settings shape evolves. Add new keys to
// `AppSettings` (lib/types.ts) and to the schema here — with a default, so GET
// /api/settings always returns a complete object.

export type AppSettingsPatch = Partial<AppSettings>

let _dir = DATA_DIR
let _store: Conf<AppSettings> | null = null

// Test seam: point the store at a scratch dir (mirrors setThreadConfigPath).
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

// Merge a partial settings object over the stored one. `undefined` fields are
// left untouched; there is no clear-to-default, since every key always holds a
// concrete value. Returns the full merged settings.
export function saveAppSettings(patch: AppSettingsPatch): AppSettings {
  const settings = store()
  for (const key of Object.keys(patch) as (keyof AppSettings)[]) {
    const value = patch[key]
    if (value !== undefined) settings.set(key, value)
  }
  return settings.store
}
