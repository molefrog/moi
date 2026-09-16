import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'

import { isAgentCaller } from '../agent-caller'

const CLI = join(import.meta.dir, '..', 'cli.ts')

// The four agent markers: moi's own announcement plus third-party runtimes.
const MARKERS = ['MOI_AGENT', 'CLAUDECODE', 'CODEX_SANDBOX', 'CURSOR_TRACE_ID'] as const

describe('isAgentCaller', () => {
  test('any single marker flips it', () => {
    expect(isAgentCaller({})).toBe(false)
    for (const marker of MARKERS) {
      expect(isAgentCaller({ [marker]: '1' })).toBe(true)
    }
    expect(isAgentCaller({ CODEX_SANDBOX: 'seatbelt' })).toBe(true)
  })

  test('empty-string markers do not count', () => {
    expect(isAgentCaller({ CLAUDECODE: '' })).toBe(false)
  })
})

async function runHelp(
  envPatch: Record<string, string | undefined>,
  command?: string
): Promise<string> {
  const proc = Bun.spawn(['bun', CLI, ...(command ? [command] : []), '--help'], {
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'ignore',
    // Clear every marker first (this test itself runs under an agent), then
    // apply the case's patch.
    env: {
      ...process.env,
      NO_COLOR: '1',
      ...Object.fromEntries(MARKERS.map(m => [m, undefined])),
      ...envPatch
    }
  })
  const [out] = await Promise.all([new Response(proc.stdout).text(), proc.exited])
  return out
}

describe('moi --help (e2e)', () => {
  test('human view: both sections', async () => {
    const out = await runHelp({})
    expect(out).toContain('Workspace commands:')
    expect(out).toContain('System commands:')
    expect(out).toContain('AGENTS: do not run these unless explicitly asked!')
    expect(out).toContain('service')
    expect(out).toContain('update')
  }, 30_000)

  test('agent view: system section omitted entirely', async () => {
    const out = await runHelp({ MOI_AGENT: '1' })
    expect(out).toContain('Workspace commands:')
    expect(out).toContain('bundle')
    expect(out).not.toContain('System commands:')
    expect(out).not.toContain('AGENTS:')
    expect(out).not.toContain('service')
    expect(out).not.toContain('moi update')
  }, 30_000)

  test('third-party markers hide it too', async () => {
    const out = await runHelp({ CLAUDECODE: '1' })
    expect(out).not.toContain('System commands:')
  }, 30_000)

  test('navigation has its own command and tabs is discovery only', async () => {
    const rootHelp = await runHelp({})
    const tabsHelp = await runHelp({}, 'tabs')

    expect(rootHelp).toContain('navigate')
    expect(rootHelp).not.toContain('tabs focus')
    expect(rootHelp).not.toMatch(/^\s+tab\s/m)
    expect(tabsHelp).not.toContain('focus')
    const navigationHelp = await runHelp({}, 'navigate')
    expect(navigationHelp).not.toContain('--replace')
    expect(navigationHelp).toContain('moi:/views/events')
  }, 30_000)
})

test('removed tab focus command fails before contacting a server', async () => {
  const proc = Bun.spawn(['bun', CLI, 'tabs', 'focus', 'view:events'], {
    stdout: 'pipe',
    stderr: 'pipe'
  })
  const [error, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited])
  expect(code).toBe(1)
  expect(error).toContain('Use moi navigate <address>')
})
