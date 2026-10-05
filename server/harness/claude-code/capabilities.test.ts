import { describe, expect, test } from 'bun:test'

import type { ClaudeCli } from './cli'
import {
  type ClaudeCapabilities,
  autoPermissionsAvailability,
  createClaudeCapabilityCache,
  parseAutoPermissionMode,
  parsePermissionModes
} from './capabilities'

// Verbatim from `env -u CLAUDECODE claude --help` on 2.1.263, wrapping included.
const HELP_WITH_AUTO = `Usage: claude [options] [command] [prompt]

Options:
  --output-format <format>              Output format (only works with --print)
                                        (choices: "text", "json",
                                        "stream-json")
  --permission-mode <mode>              Permission mode to use for the session
                                        (choices: "acceptEdits", "auto",
                                        "bypassPermissions", "manual",
                                        "dontAsk", "plan")
  --permission-prompts <target>         Who answers permission prompts
`

// The 2.1.45 lineup, as quoted by the error the first message produced.
const HELP_WITHOUT_AUTO = `Options:
  --permission-mode <mode>              Permission mode to use for the session
                                        (choices: "acceptEdits",
                                        "bypassPermissions", "default",
                                        "delegate", "dontAsk", "plan")
`

describe('parsePermissionModes', () => {
  test('reads the choices across wrapped lines', () => {
    expect(parsePermissionModes(HELP_WITH_AUTO)).toEqual([
      'acceptEdits',
      'auto',
      'bypassPermissions',
      'manual',
      'dontAsk',
      'plan'
    ])
  })

  test('ignores the choices of earlier flags', () => {
    expect(parsePermissionModes(HELP_WITH_AUTO)).not.toContain('stream-json')
  })

  test('returns null when the flag or its choices are missing', () => {
    expect(parsePermissionModes('')).toBeNull()
    expect(parsePermissionModes('  --print   Print the response\n')).toBeNull()
    expect(parsePermissionModes('  --permission-mode <mode>  Permission mode\n')).toBeNull()
    expect(parsePermissionModes('--permission-mode (choices: acceptEdits, plan)')).toBeNull()
  })
})

describe('parseAutoPermissionMode', () => {
  test('accepts a CLI that lists auto', () => {
    expect(parseAutoPermissionMode(HELP_WITH_AUTO)).toBe(true)
  })

  test('rejects a CLI that does not list auto', () => {
    expect(parseAutoPermissionMode(HELP_WITHOUT_AUTO)).toBe(false)
  })

  test('stays unknown for garbage input', () => {
    expect(parseAutoPermissionMode('')).toBeNull()
    expect(parseAutoPermissionMode('  not help text at all')).toBeNull()
  })
})

const EXECUTABLE = '/usr/local/bin/claude'
const OLD_CLI: ClaudeCli = { executable: EXECUTABLE, version: '2.1.45 (Claude Code)' }
const NEW_CLI: ClaudeCli = { executable: EXECUTABLE, version: '2.1.263 (Claude Code)' }

const SUPPORTED: ClaudeCapabilities = { autoPermissionMode: true }
const UNSUPPORTED: ClaudeCapabilities = { autoPermissionMode: false }
const UNKNOWN: ClaudeCapabilities = { autoPermissionMode: null }

// A capability cache whose CLI identity and `--help` answers are scripted.
function scriptedCache(script: { probes: ClaudeCli[]; capabilities: ClaudeCapabilities[] }) {
  let probeCalls = 0
  let inspectCalls = 0
  const cache = createClaudeCapabilityCache({
    probe: async () => {
      const cli = script.probes[probeCalls] ?? script.probes[script.probes.length - 1]
      probeCalls += 1
      if (!cli) throw new Error('no scripted probe')
      return cli
    },
    inspect: async () => {
      const capabilities =
        script.capabilities[inspectCalls] ?? script.capabilities[script.capabilities.length - 1]
      inspectCalls += 1
      if (!capabilities) throw new Error('no scripted capabilities')
      return capabilities
    }
  })
  return { cache, inspectCalls: () => inspectCalls }
}

describe('createClaudeCapabilityCache', () => {
  test('runs one help probe per CLI identity', async () => {
    const { cache, inspectCalls } = scriptedCache({
      probes: [OLD_CLI],
      capabilities: [UNSUPPORTED]
    })

    expect((await cache.get(EXECUTABLE)).capabilities).toEqual(UNSUPPORTED)
    expect((await cache.get(EXECUTABLE)).capabilities).toEqual(UNSUPPORTED)
    expect(inspectCalls()).toBe(1)
    expect(cache.current()).toEqual(UNSUPPORTED)
  })

  test('re-probes when the CLI identity changes', async () => {
    const { cache, inspectCalls } = scriptedCache({
      probes: [OLD_CLI, NEW_CLI],
      capabilities: [UNSUPPORTED, SUPPORTED]
    })

    expect((await cache.get(EXECUTABLE)).capabilities).toEqual(UNSUPPORTED)
    expect((await cache.get(EXECUTABLE)).capabilities).toEqual(SUPPORTED)
    expect(inspectCalls()).toBe(2)
  })

  test('keeps the cached answer while the version probe fails', async () => {
    const unknownCli: ClaudeCli = { executable: EXECUTABLE, version: null }
    const { cache, inspectCalls } = scriptedCache({
      probes: [OLD_CLI, unknownCli],
      capabilities: [UNSUPPORTED, SUPPORTED]
    })

    const first = await cache.get(EXECUTABLE)
    const second = await cache.get(EXECUTABLE)

    expect(second.capabilities).toEqual(first.capabilities)
    expect(second.cli).toEqual(OLD_CLI)
    expect(inspectCalls()).toBe(1)
  })
})

describe('autoPermissionsAvailability', () => {
  test('names the version moi cannot use', async () => {
    const { cache } = scriptedCache({ probes: [OLD_CLI], capabilities: [UNSUPPORTED] })

    expect(autoPermissionsAvailability(await cache.get(EXECUTABLE))).toEqual({
      status: 'unavailable',
      reason: "Claude Code 2.1.45 doesn't support auto permissions. Run claude update"
    })
  })

  test('does not block a supported CLI', async () => {
    const { cache } = scriptedCache({ probes: [NEW_CLI], capabilities: [SUPPORTED] })

    expect(autoPermissionsAvailability(await cache.get(EXECUTABLE))).toBeNull()
  })

  test('does not block when the probe came back unknown', async () => {
    const { cache } = scriptedCache({ probes: [NEW_CLI], capabilities: [UNKNOWN] })

    expect(autoPermissionsAvailability(await cache.get(EXECUTABLE))).toBeNull()
  })

  test('still reports an unsupported CLI whose version is unknown', () => {
    expect(
      autoPermissionsAvailability({
        cli: { executable: EXECUTABLE, version: null },
        capabilities: UNSUPPORTED
      })
    ).toEqual({
      status: 'unavailable',
      reason: "This Claude Code doesn't support auto permissions. Run claude update"
    })
  })
})
