// Per-workspace environment variables surfaced to both spawn sites: the widget
// function workers (functions.ts) and the agent chat session (cc-session.ts).
//
// Two sources feed a workspace's effective env:
//   1. Discovered `.env` files in the workspace root (`.env`, then `.env.local`,
//      local winning). Parsed with node:util's built-in `parseEnv` — no dep.
//      `.env` flows to BOTH sinks (it's the workspace's own file).
//   2. UI-managed custom secrets. These never touch the repo. Secret VALUES are
//      stored via the OS keychain (`Bun.secrets`) when available, else a 0600
//      file fallback — see SecretStore. Each custom key has a sink scope
//      (widgets / agent / both) so a secret can be kept out of the agent's
//      bypass-permissions Bash. Custom wins over `.env`.
//
// Non-secret metadata (the `inheritDotenv` mode flag + per-key scopes, which
// double as the key-name list for the UI) lives in a small JSON file in the OS
// data dir. Secret values live in the SecretStore. The two are keyed by the
// absolute workspace path.
import envPaths from 'env-paths'
import { chmod, mkdir, rename } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { parseEnv } from 'node:util'

import type { EnvScope, WorkspaceEnvView } from '@/lib/types'

// Dotenv files scanned in the workspace root, low → high precedence. A later
// file's keys override an earlier file's (base `.env`, machine-local `.env.local`).
const DOTENV_FILES = ['.env', '.env.local'] as const

// Valid POSIX-ish env var name. Used to reject junk keys from the API.
const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/
const SCOPES: readonly EnvScope[] = ['widgets', 'agent', 'both']

export function isValidEnvKey(key: string): boolean {
  return ENV_KEY_RE.test(key)
}

export function isValidScope(scope: unknown): scope is EnvScope {
  return typeof scope === 'string' && (SCOPES as readonly string[]).includes(scope)
}

// Where a key may flow, given its sink. `agent`/`widgets` only match their own
// sink; `both` matches either.
type Sink = 'widgets' | 'agent'

const DATA_DIR = envPaths('moi', { suffix: false }).data
const DEFAULT_META_PATH = join(DATA_DIR, 'workspace-env.json')
const DEFAULT_SECRET_PATH = join(DATA_DIR, 'workspace-secrets.json')
// Keychain namespace for Bun.secrets entries.
const SECRET_SERVICE = 'com.molefrog.moi'

// ---------------------------------------------------------------------------
// JSON helpers
// ---------------------------------------------------------------------------

// Parse a JSON object, returning {} on any failure (missing/empty/malformed).
function parseJsonObject<T extends object>(text: string | null): T {
  if (!text) return {} as T
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' ? (parsed as T) : ({} as T)
  } catch {
    return {} as T
  }
}

async function readJsonObjectFile<T extends object>(path: string): Promise<T> {
  try {
    return parseJsonObject<T>(await Bun.file(path).text())
  } catch {
    return {} as T
  }
}

// Atomic, owner-only write: temp-then-rename so a crash or concurrent write
// can't truncate the store; 0600 file in a 0700 dir.
async function writeJsonAtomic(path: string, data: unknown): Promise<void> {
  const dir = dirname(path)
  await mkdir(dir, { recursive: true })
  try {
    await chmod(dir, 0o700)
  } catch {}
  const tmp = `${path}.${process.pid}.tmp`
  await Bun.write(tmp, JSON.stringify(data, null, 2))
  await chmod(tmp, 0o600)
  await rename(tmp, path)
}

// ---------------------------------------------------------------------------
// Paths + per-workspace write serialization (overridable for tests)
// ---------------------------------------------------------------------------

let _metaPath = DEFAULT_META_PATH
let _secretFilePath = DEFAULT_SECRET_PATH

export function setWorkspaceEnvStorePath(metaPath: string, secretPath?: string) {
  _metaPath = metaPath
  if (secretPath) _secretFilePath = secretPath
  _storePromise = null
}

// Reset module globals to defaults. Tests call this so path/backend overrides
// don't leak across files.
export function resetWorkspaceEnvForTest() {
  _metaPath = DEFAULT_META_PATH
  _secretFilePath = DEFAULT_SECRET_PATH
  setSecretStoreBackend('auto')
}

// Serialize writes per workspace path so two concurrent PUTs can't lose an
// update — `updateWorkspaceEnv` is a read-modify-write over two files, and the
// atomic write only prevents torn files, not lost updates.
const _writeChains = new Map<string, Promise<unknown>>()

function withWriteLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = _writeChains.get(key) ?? Promise.resolve()
  const run = prev.then(fn, fn)
  // Swallow rejections on the chain tail so one failed write doesn't poison the
  // next; callers still see their own promise's rejection via `run`.
  _writeChains.set(
    key,
    run.catch(() => {})
  )
  return run
}

// ---------------------------------------------------------------------------
// SecretStore: where custom secret VALUES live
// ---------------------------------------------------------------------------

// Per-workspace bag of `{ KEY: value }`. Stored as one opaque value per
// workspace (keychain entry or file row). Values never leave this layer except
// when injected into a spawn.
type SecretStore = {
  readonly backend: 'keychain' | 'file'
  get(workspacePath: string): Promise<Record<string, string>>
  set(workspacePath: string, secrets: Record<string, string>): Promise<void>
}

// Primary: OS-native secure storage via Bun.secrets (Keychain / libsecret /
// Credential Manager). Encrypted at rest, user-scoped, no password prompt.
class KeychainSecretStore implements SecretStore {
  readonly backend = 'keychain' as const

  async get(workspacePath: string): Promise<Record<string, string>> {
    const raw = await Bun.secrets.get({ service: SECRET_SERVICE, name: resolve(workspacePath) })
    return parseJsonObject<Record<string, string>>(raw)
  }

  async set(workspacePath: string, secrets: Record<string, string>): Promise<void> {
    const name = resolve(workspacePath)
    if (Object.keys(secrets).length === 0) {
      try {
        await Bun.secrets.delete({ service: SECRET_SERVICE, name })
      } catch {}
      return
    }
    await Bun.secrets.set({ service: SECRET_SERVICE, name, value: JSON.stringify(secrets) })
  }
}

// Fallback for hosts without a keyring (headless Linux, CI, SSH). Plaintext
// JSON, but written 0600 in a 0700 dir and atomically. No encryption at rest —
// a local keyfile would have the same exposure as the data, so it adds nothing.
class FileSecretStore implements SecretStore {
  readonly backend = 'file' as const

  private readAll(): Promise<Record<string, Record<string, string>>> {
    return readJsonObjectFile<Record<string, Record<string, string>>>(_secretFilePath)
  }

  async get(workspacePath: string): Promise<Record<string, string>> {
    return (await this.readAll())[resolve(workspacePath)] ?? {}
  }

  async set(workspacePath: string, secrets: Record<string, string>): Promise<void> {
    const all = await this.readAll()
    const key = resolve(workspacePath)
    if (Object.keys(secrets).length === 0) delete all[key]
    else all[key] = secrets
    await writeJsonAtomic(_secretFilePath, all)
  }
}

// Non-mutating probe: a `get` of a missing key returns null when the keyring
// works, throws when it's unavailable. Avoids polluting the keychain.
async function keychainAvailable(): Promise<boolean> {
  try {
    await Bun.secrets.get({ service: SECRET_SERVICE, name: '__moi_probe__' })
    return true
  } catch {
    return false
  }
}

let _backend: 'auto' | 'file' | 'keychain' = 'auto'
let _storePromise: Promise<SecretStore> | null = null

// Force a backend (tests pin 'file' so they never touch the real keychain).
export function setSecretStoreBackend(backend: 'auto' | 'file' | 'keychain') {
  _backend = backend
  _storePromise = null
}

async function createSecretStore(): Promise<SecretStore> {
  if (_backend === 'file') return new FileSecretStore()
  if (_backend === 'keychain') return new KeychainSecretStore()
  if (await keychainAvailable()) {
    console.log('[env] workspace secrets: OS keychain')
    return new KeychainSecretStore()
  }
  console.warn(
    `[env] OS keychain unavailable — storing workspace secrets in ${_secretFilePath} (0600).`
  )
  return new FileSecretStore()
}

function secretStore(): Promise<SecretStore> {
  if (!_storePromise) _storePromise = createSecretStore()
  return _storePromise
}

// ---------------------------------------------------------------------------
// Metadata: inheritDotenv + per-key scopes (NOT secret)
// ---------------------------------------------------------------------------

type EnvMeta = { inheritDotenv: boolean; scopes: Record<string, EnvScope> }
type MetaStore = Record<string, EnvMeta>

async function getMeta(workspacePath: string): Promise<EnvMeta> {
  const e = (await readJsonObjectFile<MetaStore>(_metaPath))[resolve(workspacePath)]
  if (!e || typeof e !== 'object') return { inheritDotenv: true, scopes: {} }
  return {
    inheritDotenv: e.inheritDotenv !== false,
    scopes: e.scopes && typeof e.scopes === 'object' ? e.scopes : {}
  }
}

async function writeMeta(workspacePath: string, meta: EnvMeta): Promise<void> {
  const store = await readJsonObjectFile<MetaStore>(_metaPath)
  store[resolve(workspacePath)] = meta
  await writeJsonAtomic(_metaPath, store)
}

// The scope of a custom key, defaulting to 'both' when unset.
function scopeOf(meta: EnvMeta, key: string): EnvScope {
  return meta.scopes[key] ?? 'both'
}

// ---------------------------------------------------------------------------
// Dotenv discovery
// ---------------------------------------------------------------------------

type DotenvFile = { file: string; vars: Record<string, string> }

async function discoverDotenv(workspacePath: string): Promise<DotenvFile[]> {
  const out: DotenvFile[] = []
  for (const file of DOTENV_FILES) {
    const f = Bun.file(resolve(workspacePath, file))
    if (!(await f.exists())) continue
    try {
      out.push({ file, vars: parseEnv(await f.text()) as Record<string, string> })
    } catch {
      // A malformed .env shouldn't take the whole resolve down.
    }
  }
  return out
}

function mergeDotenv(files: DotenvFile[]): Record<string, string> {
  const merged: Record<string, string> = {}
  for (const { vars } of files) Object.assign(merged, vars)
  return merged
}

// Read everything a workspace's env depends on, in parallel. `dotenv` is the
// inheritDotenv-gated merge (the actual base env); `files` keeps per-file detail
// for the view.
type WorkspaceEnvState = {
  meta: EnvMeta
  files: DotenvFile[]
  secrets: Record<string, string>
  dotenv: Record<string, string>
  backend: 'keychain' | 'file'
}

async function loadWorkspaceEnvState(workspacePath: string): Promise<WorkspaceEnvState> {
  const store = await secretStore()
  const [meta, files, secrets] = await Promise.all([
    getMeta(workspacePath),
    discoverDotenv(workspacePath),
    store.get(workspacePath)
  ])
  return {
    meta,
    files,
    secrets,
    dotenv: meta.inheritDotenv ? mergeDotenv(files) : {},
    backend: store.backend
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// The effective env for one sink: discovered `.env` (when inherited) overlaid
// with the custom secrets scoped to that sink. Injected at spawn — env is frozen
// once the process starts, so changes require a restart (see functions.ts /
// cc-session.ts).
export async function resolveWorkspaceEnv(
  workspacePath: string,
  sink: Sink
): Promise<Record<string, string>> {
  const { meta, secrets, dotenv } = await loadWorkspaceEnvState(workspacePath)
  const scoped: Record<string, string> = {}
  for (const [k, v] of Object.entries(secrets)) {
    const scope = scopeOf(meta, k)
    if (scope === 'both' || scope === sink) scoped[k] = v
  }
  return { ...dotenv, ...scoped }
}

export type EnvUpdate = {
  // Upsert these custom secret values (write-only).
  set?: Record<string, string>
  // Delete these custom keys.
  remove?: string[]
  // Set the sink scope for existing custom keys.
  scopes?: Record<string, EnvScope>
  // Toggle whether `.env` files feed the workspace.
  inheritDotenv?: boolean
}

// Apply a patch to a workspace's custom secrets + metadata. Patch (not replace)
// semantics, because values are write-only — the UI can add/update one key
// without resending the others. Serialized per workspace to avoid lost updates.
export function updateWorkspaceEnv(workspacePath: string, patch: EnvUpdate): Promise<void> {
  return withWriteLock(resolve(workspacePath), async () => {
    const store = await secretStore()
    const secrets = await store.get(workspacePath)

    if (patch.set) {
      for (const [k, v] of Object.entries(patch.set)) {
        if (isValidEnvKey(k) && typeof v === 'string') secrets[k] = v
      }
    }
    if (patch.remove) {
      for (const k of patch.remove) delete secrets[k]
    }
    await store.set(workspacePath, secrets)

    const meta = await getMeta(workspacePath)
    const scopes: Record<string, EnvScope> = {}
    // Keep a scope for every current secret key (default 'both'); drop the rest.
    for (const k of Object.keys(secrets)) scopes[k] = scopeOf(meta, k)
    if (patch.scopes) {
      for (const [k, s] of Object.entries(patch.scopes)) {
        if (k in scopes && isValidScope(s)) scopes[k] = s
      }
    }
    const inheritDotenv =
      typeof patch.inheritDotenv === 'boolean' ? patch.inheritDotenv : meta.inheritDotenv
    await writeMeta(workspacePath, { inheritDotenv, scopes })
  })
}

// The env view for the settings UI: every effective key with its source +
// scope, the discovered files (key counts only — values masked), the mode flag,
// the secret backend, and declared-required keys with a satisfied flag.
// `required` maps a key to the widgets that declared it (collected by caller).
export async function getWorkspaceEnvView(
  workspacePath: string,
  required: Record<string, string[]> = {}
): Promise<WorkspaceEnvView> {
  const { meta, files, secrets, dotenv, backend } = await loadWorkspaceEnvState(workspacePath)

  const keys = new Set([...Object.keys(dotenv), ...Object.keys(secrets)])
  const vars = [...keys].sort().map(key => {
    const inCustom = key in secrets
    const fromDotenv = key in dotenv
    const source = inCustom && fromDotenv ? 'both' : inCustom ? 'custom' : 'dotenv'
    return {
      key,
      source,
      ...(inCustom ? { scope: scopeOf(meta, key) } : {}),
      ...(fromDotenv ? { files: files.filter(f => key in f.vars).map(f => f.file) } : {})
    }
  })

  // A widget-declared required key is "satisfied" when it's visible to widgets:
  // a `.env` value (if inherited) or a custom key scoped widgets/both.
  const widgetVisible = new Set(Object.keys(dotenv))
  for (const k of Object.keys(secrets)) {
    if (scopeOf(meta, k) !== 'agent') widgetVisible.add(k)
  }
  const requiredView = Object.entries(required)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, widgets]) => ({ key, satisfied: widgetVisible.has(key), widgets }))

  return {
    vars,
    files: files.map(f => ({ file: f.file, count: Object.keys(f.vars).length })),
    inheritDotenv: meta.inheritDotenv,
    backend,
    required: requiredView
  }
}
