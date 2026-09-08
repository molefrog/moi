import { describe, expect, test } from 'bun:test'

import type { ModelInfo } from '@anthropic-ai/claude-agent-sdk'

import type { ClaudeCli } from './cli'
import { createClaudeCatalog, withClaudeFastModeDefault } from './models'

function model(value: string, supportsFastMode: boolean): ModelInfo {
  return {
    value,
    displayName: value,
    description: value,
    supportsFastMode
  }
}

describe('withClaudeFastModeDefault', () => {
  test('adds the resolved default only to Fast-capable models', () => {
    expect(
      withClaudeFastModeDefault([model('supported', true), model('unsupported', false)], true)
    ).toEqual([
      {
        value: 'supported',
        displayName: 'supported',
        description: 'supported',
        supportsFastMode: true,
        defaultFastMode: true
      },
      {
        value: 'unsupported',
        displayName: 'unsupported',
        description: 'unsupported',
        supportsFastMode: false
      }
    ])
  })

  test('preserves an explicitly disabled provider default', () => {
    expect(withClaudeFastModeDefault([model('supported', true)], false)[0]?.defaultFastMode).toBe(
      false
    )
  })
})

const EXECUTABLE = '/usr/local/bin/claude'
const OLD_CLI: ClaudeCli = { executable: EXECUTABLE, version: '2.1.238 (Claude Code)' }
const NEW_CLI: ClaudeCli = { executable: EXECUTABLE, version: '2.1.263 (Claude Code)' }

// A catalog whose CLI identity and fetched rows are scripted per call.
function scriptedCatalog(script: {
  probes: ClaudeCli[]
  fetch?: (call: number) => Promise<ModelInfo[]>
}) {
  let probeCalls = 0
  let fetchCalls = 0
  const catalog = createClaudeCatalog({
    probe: async () => {
      const cli = script.probes[probeCalls] ?? script.probes[script.probes.length - 1]
      probeCalls += 1
      if (!cli) throw new Error('no scripted probe')
      return cli
    },
    fetch: (_cwd, executable) => {
      fetchCalls += 1
      return script.fetch
        ? script.fetch(fetchCalls)
        : Promise.resolve([model(`${executable}#${fetchCalls}`, false)])
    }
  })
  return { catalog, probeCalls: () => probeCalls, fetchCalls: () => fetchCalls }
}

describe('createClaudeCatalog', () => {
  test('fetches once per CLI identity and re-probes the version each time', async () => {
    const { catalog, probeCalls, fetchCalls } = scriptedCatalog({ probes: [OLD_CLI] })

    const first = await catalog.models('/ws', EXECUTABLE)
    const second = await catalog.models('/ws', EXECUTABLE)

    expect(second).toBe(first)
    expect(fetchCalls()).toBe(1)
    expect(probeCalls()).toBe(2)
    expect(catalog.current()).toEqual(OLD_CLI)
  })

  test('shares one fetch between concurrent callers', async () => {
    const { catalog, fetchCalls } = scriptedCatalog({ probes: [OLD_CLI] })

    const [a, b] = await Promise.all([
      catalog.models('/ws', EXECUTABLE),
      catalog.models('/other', EXECUTABLE)
    ])

    expect(b).toBe(a)
    expect(fetchCalls()).toBe(1)
  })

  test('refetches and notifies listeners when the CLI version changes', async () => {
    const { catalog, fetchCalls } = scriptedCatalog({ probes: [OLD_CLI, NEW_CLI] })
    const changes: Array<[ClaudeCli, ClaudeCli]> = []
    catalog.onCliChanged((next, previous) => changes.push([next, previous]))

    const before = await catalog.models('/ws', EXECUTABLE)
    const after = await catalog.models('/ws', EXECUTABLE)

    expect(after).not.toBe(before)
    expect(fetchCalls()).toBe(2)
    expect(changes).toEqual([[NEW_CLI, OLD_CLI]])
    expect(catalog.current()).toEqual(NEW_CLI)
  })

  test('does not notify listeners on the first fetch', async () => {
    const { catalog } = scriptedCatalog({ probes: [OLD_CLI] })
    let notified = 0
    catalog.onCliChanged(() => {
      notified += 1
    })

    await catalog.models('/ws', EXECUTABLE)

    expect(notified).toBe(0)
  })

  test('keeps serving the cached catalog while the version probe fails', async () => {
    const unknown: ClaudeCli = { executable: EXECUTABLE, version: null }
    const { catalog, fetchCalls } = scriptedCatalog({ probes: [OLD_CLI, unknown, unknown] })
    let notified = 0
    catalog.onCliChanged(() => {
      notified += 1
    })

    const first = await catalog.models('/ws', EXECUTABLE)
    expect(await catalog.models('/ws', EXECUTABLE)).toBe(first)
    expect(await catalog.models('/ws', EXECUTABLE)).toBe(first)

    expect(fetchCalls()).toBe(1)
    expect(notified).toBe(0)
    expect(catalog.current()).toEqual(OLD_CLI)
  })

  test('treats a different executable as a new CLI even without a version', async () => {
    const moved: ClaudeCli = { executable: '/opt/homebrew/bin/claude', version: null }
    const { catalog, fetchCalls } = scriptedCatalog({ probes: [OLD_CLI, moved] })

    await catalog.models('/ws', EXECUTABLE)
    await catalog.models('/ws', moved.executable)

    expect(fetchCalls()).toBe(2)
    expect(catalog.current()).toEqual(moved)
  })

  test('drops a failed fetch so the next request retries', async () => {
    const rows = [model('retried', false)]
    const { catalog, fetchCalls } = scriptedCatalog({
      probes: [OLD_CLI],
      fetch: call => (call === 1 ? Promise.reject(new Error('probe died')) : Promise.resolve(rows))
    })

    await expect(catalog.models('/ws', EXECUTABLE)).rejects.toThrow('probe died')
    expect(catalog.current()).toBeUndefined()
    expect(await catalog.models('/ws', EXECUTABLE)).toBe(rows)
    expect(fetchCalls()).toBe(2)
  })

  test('unsubscribes a listener', async () => {
    const { catalog } = scriptedCatalog({ probes: [OLD_CLI, NEW_CLI] })
    let notified = 0
    const off = catalog.onCliChanged(() => {
      notified += 1
    })
    off()

    await catalog.models('/ws', EXECUTABLE)
    await catalog.models('/ws', EXECUTABLE)

    expect(notified).toBe(0)
  })
})
