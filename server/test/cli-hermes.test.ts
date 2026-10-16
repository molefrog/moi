import { expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { discoverHermesProfiles } from '../harness/hermes/discovery'

test('hermes init imports an explicit profile outside the discovery sample', async () => {
  const root = await mkdtemp(join(tmpdir(), 'moi-cli-hermes-'))
  const home = join(root, 'hermes')
  const previousHome = process.env.HERMES_HOME
  process.env.HERMES_HOME = home
  try {
    const ids = Array.from({ length: 140 }, (_, i) => `profile-${i}`)
    for (const id of ids) {
      const dir = join(home, 'profiles', id)
      await mkdir(dir, { recursive: true })
      await Bun.write(join(dir, 'config.yaml'), 'model:\n  default: test-model\n')
    }
    const discovered = await discoverHermesProfiles()
    const omitted = ids.find(id => !discovered.some(profile => profile.agentId === id))!
    const workspace = join(home, 'profiles', omitted, 'workspace')
    // Existing scaffold keeps this test offline; the CLI still installs skills
    // and registers the real profile in its isolated data directory.
    await mkdir(join(workspace, '.moi'), { recursive: true })
    await Bun.write(join(workspace, '.moi', 'package.json'), '{}\n')
    const proc = Bun.spawn(
      [process.execPath, join(import.meta.dir, '..', 'cli.ts'), 'hermes', 'init', omitted],
      {
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 20_000,
        env: {
          ...process.env,
          MOI_DATA_DIR: join(root, 'data'),
          MOI_CONTROL_PORT: '1',
          MOI_SERVER: undefined,
          NO_COLOR: '1'
        }
      }
    )
    const [code, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text()
    ])
    expect({ code, stderr }).toEqual({ code: 0, stderr: '' })
    expect(stdout).toContain(`Profile: ${omitted}`)
    const registered = await Bun.file(join(root, 'data', 'workspaces.json')).json()
    expect(registered).toEqual([
      expect.objectContaining({ path: workspace, type: 'hermes', agentId: omitted })
    ])
  } finally {
    if (previousHome === undefined) delete process.env.HERMES_HOME
    else process.env.HERMES_HOME = previousHome
    await rm(root, { recursive: true, force: true })
  }
}, 30_000)
