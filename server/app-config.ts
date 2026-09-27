import { readFileSync } from 'node:fs'
import { join } from 'path'

import type { ClientAppConfig } from '@/lib/types'

import { DATA_DIR } from './data-dir'

// Startup (deployment) config, read once per process from `config.json` in
// moi's data dir and overridable by `MOI_*` env vars (env wins). Distinct from
// `settings.json` (user settings: conf-backed, API-mutable, changes at
// runtime): config.json describes the deployment itself — nothing here changes
// without a server restart, and no API writes it.
//
// Resolution: defaults < config.json < env; CLI-only flags are supplied separately.
// A missing file is the normal local case; a malformed file or wrong-typed key
// warns on stderr and falls back per-key, so a broken config never takes the
// CLI or server down with it.
export type AppConfig = {
  // Cloud demo deployment: workspace creation is blocked (UI shows the
  // cloud-demo promo dialog instead) and `moi` system commands are disabled.
  cloudDemo: boolean
  // Gated experimental features, checked by slug.
  experiments: string[]
  // CLI-owned startup flag; never read from config.json or experiment slugs.
  experimentalCollab: boolean
  // Link target for the cloud-demo promo dialog.
  demoInstallUrl: string
  // Cloudflare Access (Zero Trust) in front of this deployment: each viewer
  // inherits the identity from Access's signed token. Null trusts no proxy.
  cloudflareAccess: CloudflareAccessConfig | null
}

export type CloudflareAccessConfig = {
  // Token issuer and signing-key host, e.g. https://acme.cloudflareaccess.com.
  teamDomain: string
  // Application audience (AUD) tags; a token must be issued for one of them.
  audience: readonly string[]
}

const DEFAULTS: AppConfig = {
  cloudDemo: false,
  experiments: [],
  experimentalCollab: false,
  demoInstallUrl: 'https://moi.computer',
  cloudflareAccess: null
}

export const APP_CONFIG_FILE = join(DATA_DIR, 'config.json')

function warn(message: string): void {
  console.error(`[moi] config: ${message}`)
}

// '1'/'true' (case-insensitive) are true, '0'/'false' are false, anything
// else — including empty — leaves the lower-precedence value in place.
function parseBool(raw: string | undefined): boolean | undefined {
  if (raw === undefined) return undefined
  const value = raw.trim().toLowerCase()
  if (value === '1' || value === 'true') return true
  if (value === '0' || value === 'false') return false
  return undefined
}

// "a, b,c" → ['a','b','c']; empty entries dropped. An empty string clears the
// list (explicitly setting MOI_EXPERIMENTS= disables file-set experiments).
function parseList(raw: string | undefined): string[] | undefined {
  if (raw === undefined) return undefined
  return raw
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

function parseString(raw: string | undefined): string | undefined {
  if (raw === undefined || raw.trim() === '') return undefined
  return raw.trim()
}

// `acme`, `acme.cloudflareaccess.com`, or its https URL → the token issuer
// origin. Anything with a path, query, or credentials is rejected.
function parseTeamDomain(raw: string): string | undefined {
  const value = raw.trim()
  if (!value) return undefined
  const host = /^[a-z0-9-]+$/i.test(value) ? `${value}.cloudflareaccess.com` : value
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(host) ? host : `https://${host}`)
    if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash)
      return undefined
    if (url.username || url.password) return undefined
    return url.origin
  } catch {
    return undefined
  }
}

// One AUD tag, a comma-separated list, or (in config.json) an array of tags.
function parseAudience(raw: unknown): string[] | undefined {
  const items = typeof raw === 'string' ? raw.split(',') : raw
  if (!Array.isArray(items) || !items.every(item => typeof item === 'string')) return undefined
  const tags = items.map(item => item.trim()).filter(Boolean)
  return tags.length ? tags : undefined
}

function fileCloudflareAccess(value: unknown): Partial<CloudflareAccessConfig> {
  if (value === undefined || value === null) return {}
  if (typeof value !== 'object' || Array.isArray(value)) {
    warn('ignoring "cloudflareAccess" — expected an object')
    return {}
  }
  const { teamDomain, audience } = value as Record<string, unknown>
  const out: Partial<CloudflareAccessConfig> = {}
  if (teamDomain !== undefined) {
    const parsed = typeof teamDomain === 'string' ? parseTeamDomain(teamDomain) : undefined
    if (parsed) out.teamDomain = parsed
    else warn('ignoring "cloudflareAccess.teamDomain" — expected <team>.cloudflareaccess.com')
  }
  if (audience !== undefined) {
    const parsed = parseAudience(audience)
    if (parsed) out.audience = parsed
    else warn('ignoring "cloudflareAccess.audience" — expected an AUD tag or an array of tags')
  }
  return out
}

function envCloudflareAccess(
  env: Record<string, string | undefined>
): Partial<CloudflareAccessConfig> {
  const out: Partial<CloudflareAccessConfig> = {}
  const teamDomain = parseString(env.MOI_CLOUDFLARE_ACCESS_TEAM_DOMAIN)
  if (teamDomain !== undefined) {
    const parsed = parseTeamDomain(teamDomain)
    if (parsed) out.teamDomain = parsed
    else warn('ignoring MOI_CLOUDFLARE_ACCESS_TEAM_DOMAIN — expected <team>.cloudflareaccess.com')
  }
  const audience = parseAudience(parseString(env.MOI_CLOUDFLARE_ACCESS_AUD))
  if (audience) out.audience = audience
  return out
}

// Per field, env wins over config.json. Verification needs both the issuer and
// an audience, so half a configuration trusts nothing rather than guessing.
function resolveCloudflareAccess(
  fileValue: unknown,
  env: Record<string, string | undefined>
): CloudflareAccessConfig | null {
  const { teamDomain, audience } = {
    ...fileCloudflareAccess(fileValue),
    ...envCloudflareAccess(env)
  }
  if (!teamDomain && !audience) return null
  if (!teamDomain || !audience) {
    warn('ignoring Cloudflare Access — it needs both a team domain and an audience (AUD) tag')
    return null
  }
  return Object.freeze({ teamDomain, audience: Object.freeze(audience) })
}

function readConfigFile(file: string): Record<string, unknown> {
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch (err) {
    // Only a missing file is silent (the normal local case). Anything else —
    // permissions, mount errors — is loud: a deployment relying on config.json
    // must not boot un-gated without a diagnostic. Deployments that need the
    // demo gate guaranteed should pin MOI_CLOUD_DEMO=1 in the environment,
    // which has no read-failure mode.
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      warn(`could not read ${file}: ${err instanceof Error ? err.message : String(err)}`)
    }
    return {}
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    warn(`ignoring ${file} — invalid JSON: ${err instanceof Error ? err.message : String(err)}`)
    return {}
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    warn(`ignoring ${file} — expected a JSON object`)
    return {}
  }
  return parsed as Record<string, unknown>
}

function fileValues(raw: Record<string, unknown>): Partial<AppConfig> {
  const out: Partial<AppConfig> = {}
  if (raw.cloudDemo !== undefined) {
    if (typeof raw.cloudDemo === 'boolean') out.cloudDemo = raw.cloudDemo
    else warn('ignoring "cloudDemo" — expected a boolean')
  }
  if (raw.experiments !== undefined) {
    if (Array.isArray(raw.experiments) && raw.experiments.every(item => typeof item === 'string')) {
      out.experiments = raw.experiments
    } else warn('ignoring "experiments" — expected an array of strings')
  }
  if (raw.demoInstallUrl !== undefined) {
    if (typeof raw.demoInstallUrl === 'string') out.demoInstallUrl = raw.demoInstallUrl
    else warn('ignoring "demoInstallUrl" — expected a string')
  }
  return out
}

// Pure resolver, exported for tests. `getAppConfig` is the cached entrypoint.
export function loadAppConfig(
  file: string = APP_CONFIG_FILE,
  env: Record<string, string | undefined> = process.env,
  flags: Pick<AppConfig, 'experimentalCollab'> = { experimentalCollab: false }
): AppConfig {
  const raw = readConfigFile(file)
  const fromFile = fileValues(raw)
  const fromEnv: Partial<AppConfig> = {
    cloudDemo: parseBool(env.MOI_CLOUD_DEMO),
    experiments: parseList(env.MOI_EXPERIMENTS),
    demoInstallUrl: parseString(env.MOI_DEMO_INSTALL_URL)
  }
  const merged = { ...DEFAULTS, ...fromFile }
  for (const key of Object.keys(fromEnv) as (keyof AppConfig)[]) {
    if (fromEnv[key] === undefined) delete fromEnv[key]
  }
  const cloudflareAccess = resolveCloudflareAccess(raw.cloudflareAccess, env)
  return Object.freeze({ ...merged, ...fromEnv, cloudflareAccess, ...flags })
}

let _config: AppConfig | null = null

// The CLI supplies parsed startup flags before importing the web server.
export function initializeAppConfig(flags: Pick<AppConfig, 'experimentalCollab'>): void {
  _config = loadAppConfig(undefined, undefined, flags)
}

export function getAppConfig(): AppConfig {
  _config ??= loadAppConfig()
  return _config
}

// Test seam: drop the cached config so the next getAppConfig() re-resolves
// (tests point MOI_DATA_DIR elsewhere or set MOI_CLOUD_DEMO).
export function resetAppConfig(): void {
  _config = null
}

// The only shape that reaches the browser (GET /api/config). Server-only keys
// added to AppConfig later stay out unless explicitly forwarded here.
export function clientAppConfig(): ClientAppConfig {
  const { cloudDemo, experiments, experimentalCollab, demoInstallUrl } = getAppConfig()
  return { cloudDemo, experiments: [...experiments], experimentalCollab, demoInstallUrl }
}
