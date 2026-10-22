import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { BUNDLED_SKILLS_DIR } from '../skills/template'
import { readSkillVersion } from '../skills/version'

let root = ''
let workspace = ''

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'moi-cli-skill-'))
  workspace = join(root, 'workspace')
  for (const directory of ['.claude', '.agents']) {
    await Bun.write(
      join(workspace, directory, 'skills', 'moi-workspace', 'SKILL.md'),
      '<moi-skill version="0.13.0" />\n'
    )
  }
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

async function runSkill(args: string[] = []) {
  const proc = Bun.spawn(
    [process.execPath, join(import.meta.dir, '..', 'cli.ts'), 'skill', ...args, '--dir', workspace],
    {
      cwd: workspace,
      env: {
        ...process.env,
        MOI_DATA_DIR: join(root, 'data'),
        NO_COLOR: '1',
        FORCE_COLOR: undefined
      },
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe'
    }
  )
  const [code, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text()
  ])
  expect(stderr).toBe('')
  expect(code).toBe(0)
  return stdout
}

describe('skill CLI', () => {
  for (const command of ['update', 'install']) {
    test(`${command} refreshes both copies and reports each path`, async () => {
      const before = await runSkill()
      expect(before.match(/update available/g)).toHaveLength(2)
      const updated = await runSkill([command])
      const bundled = await readSkillVersion(join(BUNDLED_SKILLS_DIR, 'moi-workspace', 'SKILL.md'))
      for (const directory of ['.claude', '.agents']) {
        const path = join(directory, 'skills', 'moi-workspace')
        expect(updated.split('\n').find(line => line.includes(path))).toContain('0.13.0')
        expect(await readSkillVersion(join(workspace, path, 'SKILL.md'))).toBe(bundled)
        for (const reference of ['INTENTS.md', 'UI-COMPONENTS.md']) {
          expect(await Bun.file(join(workspace, path, 'references', reference)).exists()).toBe(true)
        }
      }
      const after = await runSkill()
      expect(after.match(/up to date/g)).toHaveLength(2)
      expect(after).not.toContain('update available')
      expect(after).not.toContain(workspace)
    })
  }

  test('matches before/after and file changes to the correct copy', async () => {
    await runSkill(['update'])
    const codex = join(workspace, '.agents', 'skills', 'moi-workspace')
    await rm(join(codex, 'references', 'INTENTS.md'))
    const output = await runSkill(['update'])
    expect(
      output.split('\n').find(line => line.includes('.claude/skills/moi-workspace'))
    ).toContain('(no change)')
    expect(
      output.split('\n').find(line => line.includes('.agents/skills/moi-workspace'))
    ).toContain('(files changed)')
    await Bun.write(join(codex, 'SKILL.md'), '<moi-skill version="0.13.0" />\n')
    const stale = await runSkill()
    expect(stale.split('\n').find(line => line.includes('.claude/skills/moi-workspace'))).toContain(
      'up to date'
    )
    expect(stale.split('\n').find(line => line.includes('.agents/skills/moi-workspace'))).toContain(
      'update available'
    )
    const fixed = await runSkill(['update'])
    expect(fixed.split('\n').find(line => line.includes('.agents/skills/moi-workspace'))).toContain(
      '0.13.0'
    )
    expect(fixed.split('\n').find(line => line.includes('.claude/skills/moi-workspace'))).toContain(
      '(no change)'
    )
  })
})
