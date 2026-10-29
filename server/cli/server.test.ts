import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PACKAGE_ROOT } from '../version'
import { spawnServer } from './server'

test('server children use the launcher runtime even when PATH has no Bun', async () => {
  const emptyPath = await mkdtemp(join(tmpdir(), 'moi-server-path-'))
  try {
    // Help exits before opening ports or touching user state, while exercising
    // the real child executable and CLI entrypoint. A bare `bun` cannot launch.
    const child = spawnServer(PACKAGE_ROOT, { ...process.env, PATH: emptyPath, NO_COLOR: '1' }, [
      '--help'
    ])
    expect(await child.exited).toBe(0)
  } finally {
    await rm(emptyPath, { recursive: true, force: true })
  }
})
