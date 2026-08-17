import { describe, expect, test } from 'bun:test'

import { type DetectionSources, agentBindingFor, detectHarness } from './detect'

const WS = '/tmp/ws'

// Every source empty by default; each test opts into the signals it needs.
function sources(over: Partial<DetectionSources> = {}): Partial<DetectionSources> {
  return {
    hermesProfiles: async () => [],
    openclawAgents: async () => [],
    codexWorkspaces: async () => [],
    claudeCodeWorkspaces: async () => [],
    hasClaudeConfigDir: () => false,
    ...over
  }
}

const profile = (path: string) => ({
  agentId: 'default',
  home: '/home/.hermes',
  path,
  isDefault: true
})

const agent = (path: string) => ({ path, agentId: 'ada', name: 'Ada', isDefault: false })

describe('detectHarness', () => {
  test('returns null when nothing matches', async () => {
    expect(await detectHarness(WS, sources())).toBeNull()
  })

  test('Hermes profile wins over every other signal', async () => {
    const found = await detectHarness(
      WS,
      sources({
        hermesProfiles: async () => [profile(WS)],
        openclawAgents: async () => [agent(WS)],
        codexWorkspaces: async () => [WS],
        claudeCodeWorkspaces: async () => [WS]
      })
    )
    expect(found?.type).toBe('hermes')
    expect(found?.agent).toEqual({ agentId: 'default', isDefault: true })
  })

  test('OpenClaw agent wins over history-based signals', async () => {
    const found = await detectHarness(
      WS,
      sources({
        openclawAgents: async () => [agent(WS)],
        codexWorkspaces: async () => [WS],
        claudeCodeWorkspaces: async () => [WS]
      })
    )
    expect(found?.type).toBe('openclaw')
    expect(found?.agent).toEqual({ agentId: 'ada', name: 'Ada', isDefault: false })
  })

  test('Codex history wins over Claude Code history', async () => {
    const found = await detectHarness(
      WS,
      sources({ codexWorkspaces: async () => [WS], claudeCodeWorkspaces: async () => [WS] })
    )
    expect(found?.type).toBe('codex')
    expect(found?.agent).toBeUndefined()
  })

  test('falls back to Claude Code history, then a .claude/ directory', async () => {
    const byHistory = await detectHarness(WS, sources({ claudeCodeWorkspaces: async () => [WS] }))
    expect(byHistory?.type).toBe('claude-code')

    const byConfigDir = await detectHarness(WS, sources({ hasClaudeConfigDir: () => true }))
    expect(byConfigDir?.type).toBe('claude-code')
  })

  test('a different path is not a match', async () => {
    const found = await detectHarness(
      WS,
      sources({
        hermesProfiles: async () => [profile('/tmp/other')],
        openclawAgents: async () => [agent('/tmp/other')],
        codexWorkspaces: async () => ['/tmp/other']
      })
    )
    expect(found).toBeNull()
  })

  test('relative and unnormalized paths resolve before matching', async () => {
    const found = await detectHarness('/tmp/ws/.', sources({ codexWorkspaces: async () => [WS] }))
    expect(found?.type).toBe('codex')
  })

  // The OpenClaw gateway being down (or the SDK throwing) must not abort
  // detection — it is a miss, and the next candidate still gets a turn.
  test('a throwing source falls through instead of failing', async () => {
    const found = await detectHarness(
      WS,
      sources({
        openclawAgents: async () => {
          throw new Error('gateway unreachable')
        },
        codexWorkspaces: async () => [WS]
      })
    )
    expect(found?.type).toBe('codex')
  })
})

describe('agentBindingFor', () => {
  test('resolves the provider binding for an explicit harness', async () => {
    const src = sources({
      hermesProfiles: async () => [profile(WS)],
      openclawAgents: async () => [agent(WS)]
    })
    expect(await agentBindingFor('hermes', WS, src)).toEqual({
      agentId: 'default',
      isDefault: true
    })
    expect(await agentBindingFor('openclaw', WS, src)).toEqual({
      agentId: 'ada',
      name: 'Ada',
      isDefault: false
    })
  })

  test('is null for directory-only harnesses and unknown paths', async () => {
    const src = sources({ hermesProfiles: async () => [profile(WS)] })
    expect(await agentBindingFor('claude-code', WS, src)).toBeNull()
    expect(await agentBindingFor('codex', WS, src)).toBeNull()
    expect(await agentBindingFor('hermes', '/tmp/other', src)).toBeNull()
  })
})
