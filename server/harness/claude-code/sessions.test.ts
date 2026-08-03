import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  MOI_ARCHIVED_SESSION_TAG,
  claudeSessionExists,
  claudeSessionSummary,
  visibleClaudeSessions
} from './sessions'

describe('claudeSessionSummary', () => {
  test('uses the SDK display summary unchanged', () => {
    expect(
      claudeSessionSummary({
        summary: 'Dashboard data cleanup',
        firstPrompt: 'Can you clean up this dashboard?'
      })
    ).toBe('Dashboard data cleanup')
  })

  test('keeps custom titles unchanged', () => {
    expect(
      claudeSessionSummary({
        summary: 'My custom title',
        customTitle: 'My custom title',
        firstPrompt: 'Original message'
      })
    ).toBe('My custom title')
  })

  test('keeps the SDK first-prompt fallback unchanged', () => {
    expect(
      claudeSessionSummary({
        summary: '**Build   the dashboard**',
        firstPrompt: '**Build   the dashboard**'
      })
    ).toBe('**Build   the dashboard**')
  })

  test('uses filenames for an attachment-only fallback', () => {
    expect(
      claudeSessionSummary({
        summary: '(see attached files) chart.png, notes.pdf',
        firstPrompt: '(see attached files) chart.png, notes.pdf'
      })
    ).toBe('chart.png, notes.pdf')
  })
})

describe('claudeSessionExists', () => {
  let scratchDir = ''
  let workspacePath = ''
  let previousConfigDir: string | undefined

  beforeEach(async () => {
    scratchDir = await mkdtemp(join(tmpdir(), 'moi-cc-sessions-'))
    workspacePath = join(scratchDir, 'workspace')
    previousConfigDir = process.env.CLAUDE_CONFIG_DIR
    process.env.CLAUDE_CONFIG_DIR = join(scratchDir, 'claude')
  })

  afterEach(async () => {
    if (previousConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR
    else process.env.CLAUDE_CONFIG_DIR = previousConfigDir
    await rm(scratchDir, { recursive: true, force: true })
  })

  async function writeSessionFile(sessionId: string): Promise<void> {
    // Mirrors the SDK's storage layout: one .jsonl per session under the
    // project dir named after the workspace path with `/` → `-`.
    const projectDir = join(
      process.env.CLAUDE_CONFIG_DIR!,
      'projects',
      workspacePath.replaceAll('/', '-')
    )
    await mkdir(projectDir, { recursive: true })
    const line = {
      type: 'user',
      uuid: 'turn-1',
      parentUuid: null,
      sessionId,
      timestamp: new Date().toISOString(),
      cwd: workspacePath,
      message: { role: 'user', content: 'hello' }
    }
    await writeFile(join(projectDir, `${sessionId}.jsonl`), `${JSON.stringify(line)}\n`)
  }

  test('finds a session persisted on disk', async () => {
    await writeSessionFile('11111111-2222-3333-4444-555555555555')
    expect(await claudeSessionExists('11111111-2222-3333-4444-555555555555', workspacePath)).toBe(
      true
    )
  })

  test('reports a dangling session id as missing', async () => {
    await writeSessionFile('11111111-2222-3333-4444-555555555555')
    expect(await claudeSessionExists('bb0dd21d-53bf-4910-b308-bcf3d2c67009', workspacePath)).toBe(
      false
    )
  })

  test('reports missing when the workspace has no sessions at all', async () => {
    expect(await claudeSessionExists('bb0dd21d-53bf-4910-b308-bcf3d2c67009', workspacePath)).toBe(
      false
    )
  })
})

describe('visibleClaudeSessions', () => {
  test('excludes chats carrying the moi archive tag', () => {
    expect(
      visibleClaudeSessions([
        { sessionId: 'visible', tag: 'keep-me' },
        { sessionId: 'archived', tag: MOI_ARCHIVED_SESSION_TAG },
        { sessionId: 'untagged' }
      ]).map(session => session.sessionId)
    ).toEqual(['visible', 'untagged'])
  })
})
