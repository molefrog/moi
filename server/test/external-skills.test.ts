import { describe, expect, test } from 'bun:test'

import {
  installOfficialShadcnSkill,
  SHADCN_SKILL_INSTALL_TIMEOUT_MS,
  shadcnSkillInstallSpec
} from '../external-skills'

describe('official shadcn skill installation', () => {
  for (const agent of ['claude-code', 'codex', 'openclaw'] as const) {
    test(`targets the ${agent} workspace agent`, () => {
      expect(shadcnSkillInstallSpec('/workspace', agent, {}).command).toEqual([
        'bunx',
        '--bun',
        'skills',
        'add',
        'shadcn/ui',
        '--skill',
        'shadcn',
        '--agent',
        agent,
        '--yes'
      ])
    })
  }

  test('uses a 30-second timeout and a minimal telemetry-free environment', () => {
    const spec = shadcnSkillInstallSpec('/workspace', 'codex', {
      PATH: '/bin',
      HOME: '/home/tester',
      SECRET_TOKEN: 'do-not-forward'
    })

    expect(spec).toMatchObject({
      cwd: '/workspace',
      timeout: SHADCN_SKILL_INSTALL_TIMEOUT_MS,
      killSignal: 'SIGKILL',
      env: {
        PATH: '/bin',
        HOME: '/home/tester',
        DISABLE_TELEMETRY: '1',
        NO_COLOR: '1'
      }
    })
    expect(spec.timeout).toBe(30_000)
    expect(spec.env.SECRET_TOKEN).toBeUndefined()
  })

  test('passes the workspace root and agent to the installer', async () => {
    const calls: Array<[string, string]> = []

    const installed = await installOfficialShadcnSkill(
      '/workspace',
      'codex',
      async (root, type) => {
        calls.push([root, type])
        return 0
      }
    )

    expect(installed).toEqual({ ok: true })
    expect(calls).toEqual([['/workspace', 'codex']])
  })

  test('reports a non-zero installer exit', async () => {
    const installed = await installOfficialShadcnSkill('/workspace', 'claude-code', async () => 1)

    expect(installed).toEqual({ ok: false, reason: 'installer exited with code 1' })
  })

  test('reports a thrown process error', async () => {
    const installed = await installOfficialShadcnSkill('/workspace', 'openclaw', async () => {
      throw new Error('spawn failed')
    })

    expect(installed).toEqual({ ok: false, reason: 'spawn failed' })
  })
})
