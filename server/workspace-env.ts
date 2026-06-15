// Per-workspace environment variables surfaced to both spawn sites: the widget
// function workers (functions.ts) and the agent chat session (cc-session.ts).
//
// Two sources are merged into the "effective" env a workspace runs with:
//   1. Discovered `.env` files in the workspace root (`.env`, then `.env.local`,
//      local winning). Parsed with node:util's built-in `parseEnv` — no dep.
//   2. Custom overrides set from the UI. These are NEVER written into the
//      workspace (so they can't leak via git); they live in a global store file
//      under the OS data dir, keyed by absolute workspace path.
// Custom overrides win over `.env`. The `inheritDotenv` flag is the "mode"
// toggle: when false, `.env` is ignored for injection and only custom vars feed
// the workspace (the files are still discovered, just for display).
import envPaths from 'env-paths'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseEnv } from 'node:util'

import type { WorkspaceEnvSettings, WorkspaceEnvView } from '@/lib/types'

// Dotenv files scanned in the workspace root, low → high precedence. A later
// file's keys override an earlier file's. Mirrors the common dotenv convention
// (base `.env`, machine-local `.env.local`).
const DOTENV_FILES = ['.env', '.env.local'] as const

// Valid POSIX-ish env var name. Used to reject junk keys from the API.
const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

export function isValidEnvKey(key: string): boolean {
  return ENV_KEY_RE.test(key)
}

const DATA_DIR = envPaths('moi', { suffix: false }).data
export const DEFAULT_ENV_STORE_PATH = `${DATA_DIR}/workspace-env.json`

// Overridable for tests
let _storePath = DEFAULT_ENV_STORE_PATH
export function setWorkspaceEnvStorePath(p: string) {
  _storePath = p
}

type StoreEntry = { custom: Record<string, string>; inheritDotenv: boolean }
type Store = Record<string, StoreEntry>

const DEFAULT_ENTRY: StoreEntry = { custom: {}, inheritDotenv: true }

async function readStore(): Promise<Store> {
  try {
    const text = await Bun.file(_storePath).text()
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' ? (parsed as Store) : {}
  } catch {
    return {}
  }
}

async function writeStore(store: Store): Promise<void> {
  const dir = _storePath.slice(0, _storePath.lastIndexOf('/'))
  await mkdir(dir, { recursive: true })
  await Bun.write(_storePath, JSON.stringify(store, null, 2))
}

function entryFor(store: Store, workspacePath: string): StoreEntry {
  const e = store[resolve(workspacePath)]
  if (!e || typeof e !== 'object') return { ...DEFAULT_ENTRY }
  return {
    custom: e.custom && typeof e.custom === 'object' ? e.custom : {},
    inheritDotenv: e.inheritDotenv !== false
  }
}

export async function getWorkspaceEnvSettings(
  workspacePath: string
): Promise<WorkspaceEnvSettings> {
  return entryFor(await readStore(), workspacePath)
}

// Replace a workspace's custom vars and/or the inheritDotenv flag. Returns the
// new settings. Invalid keys are dropped (callers should validate up front for
// user-facing errors).
export async function updateWorkspaceEnvSettings(
  workspacePath: string,
  patch: { custom?: Record<string, string>; inheritDotenv?: boolean }
): Promise<WorkspaceEnvSettings> {
  const store = await readStore()
  const key = resolve(workspacePath)
  const current = entryFor(store, workspacePath)

  const next: StoreEntry = {
    custom: current.custom,
    inheritDotenv: current.inheritDotenv
  }
  if (patch.custom) {
    next.custom = {}
    for (const [k, v] of Object.entries(patch.custom)) {
      if (isValidEnvKey(k) && typeof v === 'string') next.custom[k] = v
    }
  }
  if (typeof patch.inheritDotenv === 'boolean') next.inheritDotenv = patch.inheritDotenv

  store[key] = next
  await writeStore(store)
  return next
}

type DotenvFile = { file: string; vars: Record<string, string> }

// Parse each existing dotenv file in the workspace root, low → high precedence.
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

// The effective env a workspace runs with: discovered `.env` (when inherited)
// overlaid with custom overrides. This is what gets injected into the function
// workers and the agent session at spawn.
export async function resolveWorkspaceEnv(workspacePath: string): Promise<Record<string, string>> {
  const [settings, files] = await Promise.all([
    getWorkspaceEnvSettings(workspacePath),
    discoverDotenv(workspacePath)
  ])
  const base = settings.inheritDotenv ? mergeDotenv(files) : {}
  return { ...base, ...settings.custom }
}

// A view for the API / future UI: every effective key with its source, the
// discovered files (key counts only — values stay masked), the mode flag, and
// any declared-required keys with a satisfied flag. `required` maps a key to the
// widgets that declared it (collected by the caller, optional).
export async function getWorkspaceEnvView(
  workspacePath: string,
  required: Record<string, string[]> = {}
): Promise<WorkspaceEnvView> {
  const [settings, files] = await Promise.all([
    getWorkspaceEnvSettings(workspacePath),
    discoverDotenv(workspacePath)
  ])
  const dotenv = mergeDotenv(files)
  const inDotenv = settings.inheritDotenv ? dotenv : {}
  const custom = settings.custom

  const keys = new Set([...Object.keys(inDotenv), ...Object.keys(custom)])
  const vars = [...keys].sort().map(key => {
    const inCustom = key in custom
    const fromDotenv = key in inDotenv
    const source = inCustom && fromDotenv ? 'both' : inCustom ? 'custom' : 'dotenv'
    // Only custom values are returned (they're user-editable); .env values stay
    // masked so the API never echoes secrets it merely discovered.
    return {
      key,
      source: source as 'dotenv' | 'custom' | 'both',
      ...(inCustom ? { value: custom[key] } : {}),
      ...(fromDotenv ? { files: files.filter(f => key in f.vars).map(f => f.file) } : {})
    }
  })

  const effective = { ...inDotenv, ...custom }
  const requiredView = Object.entries(required)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, widgets]) => ({ key, satisfied: key in effective, widgets }))

  return {
    vars,
    files: files.map(f => ({ file: f.file, count: Object.keys(f.vars).length })),
    inheritDotenv: settings.inheritDotenv,
    required: requiredView
  }
}
