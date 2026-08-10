import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  discoverHermesProfiles,
  findHermesProfile,
  profileHomeFromWorkspace,
  profileWorkspace,
  resolveHermesProfile
} from './discovery'

let home: string // fake $HERMES_HOME
let previousHome: string | undefined

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'hermes-home-'))
  previousHome = process.env.HERMES_HOME
  process.env.HERMES_HOME = home
})

afterEach(async () => {
  if (previousHome === undefined) delete process.env.HERMES_HOME
  else process.env.HERMES_HOME = previousHome
  await rm(home, { recursive: true, force: true })
})

// A profile is any directory carrying a config.yaml — that is what Hermes
// writes for both the default profile and `hermes profile create`.
async function writeProfile(
  dir: string,
  options: { model?: string; description?: string } = {}
): Promise<void> {
  await mkdir(dir, { recursive: true })
  const model = options.model
    ? `model:\n  default: "${options.model}"\n  provider: custom\n`
    : 'model:\n  provider: custom\n'
  await Bun.write(join(dir, 'config.yaml'), `database:\n  journal_mode: "wal"\n${model}`)
  if (options.description) {
    await Bun.write(join(dir, 'profile.yaml'), `description: ${options.description}\n`)
  }
}

describe('discoverHermesProfiles', () => {
  test('returns nothing when Hermes is not installed', async () => {
    await rm(home, { recursive: true, force: true })
    expect(await discoverHermesProfiles()).toEqual([])
  })

  test('finds the default profile at the Hermes home root', async () => {
    await writeProfile(home, { model: 'kimi-k2.7-code' })

    expect(await discoverHermesProfiles()).toEqual([
      {
        agentId: 'default',
        home,
        path: join(home, 'workspace'),
        isDefault: true,
        model: 'kimi-k2.7-code'
      }
    ])
  })

  test('finds named profiles with their own model and description', async () => {
    await writeProfile(home, { model: 'kimi-k2.7-code' })
    await writeProfile(join(home, 'profiles', 'research'), {
      model: 'openai-api:gpt-5.4-mini',
      description: 'Research agent for docs'
    })

    const profiles = await discoverHermesProfiles()
    expect(profiles.map(p => p.agentId).sort()).toEqual(['default', 'research'])
    expect(profiles.find(p => p.agentId === 'research')).toEqual({
      agentId: 'research',
      home: join(home, 'profiles', 'research'),
      path: join(home, 'profiles', 'research', 'workspace'),
      isDefault: false,
      name: 'Research agent for docs',
      model: 'openai-api:gpt-5.4-mini'
    })
  })

  // A half-created profile directory (no config.yaml) is not importable.
  test('skips directories that are not provisioned profiles', async () => {
    await writeProfile(home)
    await mkdir(join(home, 'profiles', 'broken'), { recursive: true })

    expect((await discoverHermesProfiles()).map(p => p.agentId)).toEqual(['default'])
  })

  test('leaves the model blank when config.yaml has no default', async () => {
    await writeProfile(home)
    expect((await discoverHermesProfiles())[0].model).toBeUndefined()
  })
})

describe('findHermesProfile', () => {
  beforeEach(async () => {
    await writeProfile(home, { model: 'kimi-k2.7-code' })
    await writeProfile(join(home, 'profiles', 'research'), { description: 'Docs and web work' })
  })

  test('matches by profile id', async () => {
    expect((await findHermesProfile('research'))?.agentId).toBe('research')
  })

  test('matches by description, case-insensitively', async () => {
    expect((await findHermesProfile('docs and web work'))?.agentId).toBe('research')
  })

  test('returns null for an unknown profile', async () => {
    expect(await findHermesProfile('nope')).toBeNull()
  })
})

describe('resolveHermesProfile', () => {
  beforeEach(async () => {
    await writeProfile(home)
    await writeProfile(join(home, 'profiles', 'research'))
  })

  test('prefers the stored agentId', async () => {
    const resolved = await resolveHermesProfile('/some/other/path', 'research')
    expect(resolved?.agentId).toBe('research')
  })

  // Workspace entries saved before agentId was captured still have to resolve.
  test('falls back to matching the workspace path', async () => {
    const resolved = await resolveHermesProfile(join(home, 'profiles', 'research', 'workspace'))
    expect(resolved?.agentId).toBe('research')
  })

  test('returns null when nothing matches', async () => {
    expect(await resolveHermesProfile('/unknown', 'ghost')).toBeNull()
  })
})

describe('profileHomeFromWorkspace', () => {
  // Hermes reads skills from the profile home, so a workspace path has to be
  // able to climb back to it. This is the exact inverse of profileWorkspace.
  test('inverts profileWorkspace', () => {
    const home = '/home/u/.hermes/profiles/research'
    expect(profileHomeFromWorkspace(profileWorkspace(home))).toBe(home)
  })

  test('inverts the default profile too', () => {
    expect(profileHomeFromWorkspace(profileWorkspace('/home/u/.hermes'))).toBe('/home/u/.hermes')
  })

  // A path moi did not lay out must not be climbed — callers fall back to the
  // workspace rather than writing into an unrelated parent directory.
  test('returns null for a path that is not a moi-laid-out workspace', () => {
    expect(profileHomeFromWorkspace('/home/u/projects/app')).toBeNull()
    expect(profileHomeFromWorkspace('/home/u/.hermes/profiles/research')).toBeNull()
  })
})
