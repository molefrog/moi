import Conf from 'conf'

import type { AppSettings } from '@/lib/types'

import { DATA_DIR } from './data-dir'

// App-wide user settings, stored as `settings.json` in moi's data dir next to
// the workspace registry. Backed by `conf`: atomic writes, per-key JSON-schema
// validation, and migrations when the settings shape evolves. Add new keys to
// `AppSettings` (lib/types.ts) and to the schema here — with a default, so GET
// /api/settings always returns a complete object.

export type AppSettingsPatch = Partial<AppSettings>

// Which fields the API may update, each with its runtime check. Declared here
// so the PATCH /api/settings route stays generic — a new settings key only
// touches this module (schema below, and this map if it is API-updatable).
type FieldRule<K extends keyof AppSettings> = {
  expects: string
  check: (value: unknown) => value is AppSettings[K]
}

const apiUpdatable: { [K in keyof AppSettings]?: FieldRule<K> } = {
  autoUpdateSkills: { expects: 'a boolean', check: value => typeof value === 'boolean' }
}

// Pick the API-updatable fields out of an untrusted body. Unknown keys are
// ignored; a declared key holding the wrong type rejects the whole patch.
export function parseAppSettingsPatch(
  body: unknown
): { patch: AppSettingsPatch } | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'Settings patch must be an object' }
  const raw = body as Record<string, unknown>
  const patch: AppSettingsPatch = {}
  for (const key of Object.keys(apiUpdatable) as (keyof AppSettings)[]) {
    const rule = apiUpdatable[key]
    const value = raw[key]
    if (!rule || value === undefined) continue
    if (!rule.check(value)) return { error: `${key} must be ${rule.expects}` }
    patch[key] = value
  }
  return { patch }
}

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
