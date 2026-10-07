// Hermes profile discovery — the "agents" moi can import.
//
// A Hermes profile is a self-contained agent identity: its own model
// (config.yaml), keys (.env), persona (SOUL.md), skills, memories and session
// store. Profiles are the same shape as OpenClaw agents, so moi imports them
// the same way: discovered here, installed with `moi hermes init <profile>`,
// never created from the UI.
//
// Discovery reads the filesystem rather than parsing `hermes profile list` —
// that command prints an ASCII table with no --json mode.
import { stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

import { DISCOVERY_HEAD_BYTES, DISCOVERY_SCAN_MS, discoveryEntries } from '../discovery'

export const DEFAULT_PROFILE = 'default'

const WORKSPACE_DIR = 'workspace'
const PROFILE_ENTRIES = 128

export type HermesProfile = {
  // Profile id, as passed to `hermes -p <id>`. 'default' is the unnamed one.
  agentId: string
  // Profile home ($HERMES_HOME for default, else <home>/profiles/<id>).
  home: string
  // Workspace directory the agent runs in — the moi workspace path.
  path: string
  name?: string
  isDefault: boolean
  model?: string
}

export function hermesHome(): string {
  return process.env.HERMES_HOME?.trim() || join(homedir(), '.hermes')
}

// Each profile's agent workspace. Named profiles get `<home>/workspace` from
// `hermes profile create`; the default profile has no such directory, so moi
// uses the same convention under $HERMES_HOME and creates it on init.
export function profileWorkspace(home: string): string {
  return join(home, WORKSPACE_DIR)
}

// Exact inverse of `profileWorkspace` — keep the pair together. Hermes reads
// skills from `$HERMES_HOME/skills` (the profile home), never from the session
// cwd, so anything scoped to a workspace has to climb back to its profile.
// Returns null for a path moi did not lay out, so callers can fall back rather
// than write into a surprising directory.
export function profileHomeFromWorkspace(workspacePath: string): string | null {
  return basename(workspacePath) === WORKSPACE_DIR ? dirname(workspacePath) : null
}

async function isDir(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

// `model.default` out of a profile's config.yaml. Parsed with a narrow regex
// rather than a YAML dependency — this is a display hint, and a miss just
// leaves the column blank.
async function readProfileModel(home: string): Promise<string | undefined> {
  try {
    const text = await Bun.file(join(home, 'config.yaml')).slice(0, DISCOVERY_HEAD_BYTES).text()
    const section = /^model:\s*$([\s\S]*?)(?=^\S)/m.exec(text)?.[1] ?? text
    const match = /^\s{2,}(?:default|model):\s*["']?([^"'\n#]+)/m.exec(section)
    return match?.[1].trim() || undefined
  } catch {
    return undefined
  }
}

async function readProfileDescription(home: string): Promise<string | undefined> {
  try {
    const text = await Bun.file(join(home, 'profile.yaml')).slice(0, DISCOVERY_HEAD_BYTES).text()
    return /^description:\s*["']?([^"'\n#]+)/m.exec(text)?.[1].trim() || undefined
  } catch {
    return undefined
  }
}

async function loadProfile(
  agentId: string,
  home: string,
  deadline = Infinity
): Promise<HermesProfile | null> {
  // A profile without config.yaml is not provisioned (or not a profile at all).
  try {
    await stat(join(home, 'config.yaml'))
  } catch {
    return null
  }
  if (performance.now() >= deadline) return null
  const [model, name] = await Promise.all([readProfileModel(home), readProfileDescription(home)])
  return {
    agentId,
    home,
    path: profileWorkspace(home),
    isDefault: agentId === DEFAULT_PROFILE,
    ...(name ? { name } : {}),
    ...(model ? { model } : {})
  }
}

export async function discoverHermesProfiles(): Promise<HermesProfile[]> {
  const deadline = performance.now() + DISCOVERY_SCAN_MS
  const home = hermesHome()
  if (!(await isDir(home)) || performance.now() >= deadline) return []

  const out: HermesProfile[] = []
  const base = await loadProfile(DEFAULT_PROFILE, home, deadline)
  if (base) out.push(base)

  const profilesDir = join(home, 'profiles')
  for await (const entry of discoveryEntries(profilesDir, PROFILE_ENTRIES, deadline)) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
    const dir = join(profilesDir, entry.name)
    const profile = (await isDir(dir)) ? await loadProfile(entry.name, dir, deadline) : null
    if (profile) out.push(profile)
  }
  return out
}

// Match a query against `agentId` (exact) or `name` (case-insensitive).
export function matchHermesProfile(
  profiles: readonly HermesProfile[],
  query: string
): HermesProfile | null {
  return (
    profiles.find(p => p.agentId === query) ??
    profiles.find(p => p.name?.toLowerCase() === query.toLowerCase()) ??
    null
  )
}

export async function findHermesProfile(query: string): Promise<HermesProfile | null> {
  // Explicit ids keep working even when their profile is outside discovery's cap.
  const byId = await loadProfileById(query)
  if (byId) return byId
  return matchHermesProfile(await discoverHermesProfiles(), query)
}

async function loadProfileById(id: string): Promise<HermesProfile | null> {
  if (!id || id === '.' || id === '..' || basename(id) !== id) return null
  const home = hermesHome()
  return loadProfile(id, id === DEFAULT_PROFILE ? home : join(home, 'profiles', id))
}

// Which profile owns a registered workspace. Falls back to matching the
// workspace path, so entries saved before agentId was captured still resolve.
export async function resolveHermesProfile(
  workspacePath: string,
  agentId?: string
): Promise<HermesProfile | null> {
  if (agentId) {
    const byId = await loadProfileById(agentId)
    if (byId) return byId
  }
  // Legacy registrations may have no agentId. Resolve their known directory
  // directly too, so discovery's sample never determines an imported agent's availability.
  const home = profileHomeFromWorkspace(resolve(workspacePath))
  const root = resolve(hermesHome())
  if (home === root) return loadProfileById(DEFAULT_PROFILE)
  if (home && dirname(home) === join(root, 'profiles')) return loadProfileById(basename(home))
  return null
}

// Version stamp for the profile inputs that decide its default model:
// config.yaml (`model.default`, rewritten by `hermes model`) and .env
// (provider keys, which gate which entries the catalog lists at all). Mtimes,
// not contents — the ACP session reports the real resolved state, this only
// says when to ask again. A missing file stamps as such, so creating it later
// still counts as a change.
export async function hermesConfigFingerprint(home: string | null): Promise<string | undefined> {
  if (!home) return undefined
  const stamps = await Promise.all(
    ['config.yaml', '.env'].map(async file => {
      try {
        return String((await stat(join(home, file))).mtimeMs)
      } catch {
        return 'missing'
      }
    })
  )
  return stamps.join(' ')
}
