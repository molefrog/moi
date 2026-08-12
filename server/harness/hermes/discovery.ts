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
import { readdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'

export const DEFAULT_PROFILE = 'default'

const WORKSPACE_DIR = 'workspace'

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
    const text = await readFile(join(home, 'config.yaml'), 'utf8')
    const section = /^model:\s*$([\s\S]*?)(?=^\S)/m.exec(text)?.[1] ?? text
    const match = /^\s{2,}(?:default|model):\s*["']?([^"'\n#]+)/m.exec(section)
    return match?.[1].trim() || undefined
  } catch {
    return undefined
  }
}

async function readProfileDescription(home: string): Promise<string | undefined> {
  try {
    const text = await readFile(join(home, 'profile.yaml'), 'utf8')
    return /^description:\s*["']?([^"'\n#]+)/m.exec(text)?.[1].trim() || undefined
  } catch {
    return undefined
  }
}

async function loadProfile(agentId: string, home: string): Promise<HermesProfile | null> {
  // A profile without config.yaml is not provisioned (or not a profile at all).
  try {
    await stat(join(home, 'config.yaml'))
  } catch {
    return null
  }
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
  const home = hermesHome()
  if (!(await isDir(home))) return []

  const out: HermesProfile[] = []
  const base = await loadProfile(DEFAULT_PROFILE, home)
  if (base) out.push(base)

  const profilesDir = join(home, 'profiles')
  if (await isDir(profilesDir)) {
    let entries: string[] = []
    try {
      entries = await readdir(profilesDir)
    } catch {
      entries = []
    }
    const loaded = await Promise.all(
      entries.map(async name => {
        const dir = join(profilesDir, name)
        return (await isDir(dir)) ? loadProfile(name, dir) : null
      })
    )
    for (const p of loaded) if (p) out.push(p)
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
  return matchHermesProfile(await discoverHermesProfiles(), query)
}

// Which profile owns a registered workspace. Falls back to matching the
// workspace path, so entries saved before agentId was captured still resolve.
export async function resolveHermesProfile(
  workspacePath: string,
  agentId?: string
): Promise<HermesProfile | null> {
  const profiles = await discoverHermesProfiles()
  if (agentId) {
    const byId = profiles.find(p => p.agentId === agentId)
    if (byId) return byId
  }
  return profiles.find(p => p.path === workspacePath) ?? null
}
