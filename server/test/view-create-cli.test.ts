import { expect, test } from 'bun:test'
import { join, resolve } from 'node:path'

const CLI = join(import.meta.dir, '..', 'cli.ts')
const SERVER = resolve(import.meta.dir, '..')
const WORKSPACE = resolve('view-create-cli-fixture')
const HANDOFF = { viewId: 'garden', mode: 'handoff', sessionId: 'child' }

// Run the real control handler and CLI in isolation, with agent startup and
// browser navigation stubbed so the test cannot create a real view or move a tab.
async function runCreate(result: Record<string, unknown>, navigationError?: string) {
  const script = `
    import { mock, spyOn } from 'bun:test'
    const constants = await import(${JSON.stringify(join(SERVER, 'constants.ts'))})
    mock.module(${JSON.stringify(join(SERVER, 'constants.ts'))}, () => ({ ...constants, CONTROL_PORT: 0 }))
    const registry = await import(${JSON.stringify(join(SERVER, 'registry.ts'))})
    const sessions = await import(${JSON.stringify(join(SERVER, 'view-sessions.ts'))})
    const { navigationRelay } = await import(${JSON.stringify(join(SERVER, 'navigation-relay.ts'))})
    const calls = []
    spyOn(registry, 'listWorkspaces').mockResolvedValue([{ id: 'workspace', path: ${JSON.stringify(WORKSPACE)} }])
    spyOn(sessions, 'createViewFromSession').mockImplementation(async (workspace, source, requirements) => {
      calls.push({ type: 'create', workspaceId: workspace.id, source, requirements })
      return ${JSON.stringify(result)}
    })
    spyOn(navigationRelay, 'navigate').mockImplementation(async (workspaceId, href) => {
      calls.push({ type: 'navigate', workspaceId, href })
      const error = ${JSON.stringify(navigationError ?? null)}
      if (error) throw new Error(error)
    })
    const { control } = await import(${JSON.stringify(join(SERVER, 'control.ts'))})
    const cli = Bun.spawn(['bun', ${JSON.stringify(CLI)}, 'views', 'create', ${JSON.stringify(WORKSPACE)},
      '--source-session', 'source', '--requirements', 'Build a garden view'], {
      env: { ...process.env, MOI_CONTROL_PORT: String(control.port) },
      stdin: 'ignore', stdout: 'pipe', stderr: 'pipe'
    })
    const [output, error, code] = await Promise.all([
      new Response(cli.stdout).text(), new Response(cli.stderr).text(), cli.exited
    ])
    control.stop(true)
    console.log(JSON.stringify({ calls, result: JSON.parse(output), error, code }))
    process.exit(0)
  `
  const proc = Bun.spawn(['bun', '--eval', script], { stdout: 'pipe', stderr: 'pipe' })
  const [output, error, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited
  ])
  if (code !== 0) throw new Error(error)
  return JSON.parse(output) as {
    calls: Record<string, unknown>[]
    result: Record<string, unknown>
    error: string
    code: number
  }
}

const CREATE_CALL = {
  type: 'create',
  workspaceId: 'workspace',
  source: 'source',
  requirements: 'Build a garden view'
}
const NAVIGATE_CALL = { type: 'navigate', workspaceId: 'workspace', href: 'moi:/views/garden' }

test.each(['handoff', 'in-place'])('%s creation opens the new view', async mode => {
  const creation = mode === 'handoff' ? HANDOFF : { viewId: 'garden', mode }
  const { calls, result, error, code } = await runCreate(creation)
  expect(calls).toEqual([CREATE_CALL, NAVIGATE_CALL])
  expect(result).toEqual({ ok: true, ...creation })
  expect(error).toBe('')
  expect(code).toBe(0)
})

test('navigation failure warns and preserves the successful creation result', async () => {
  const { result, error, code } = await runCreate(HANDOFF, 'No browser connected')
  expect(result).toMatchObject({ ok: true, ...HANDOFF })
  expect(error.trim()).not.toBe('')
  expect(result.warning).toBe(error.trim())
  expect(code).toBe(0)
})
