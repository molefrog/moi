// `bun run test:visual [files…]`: builds the client once, then runs the
// visual test files through @uiverify/bun against moi started with the
// seeded workspaces (serve.ts), and writes the archive for `uiverify upload`.
import { run } from '@uiverify/bun/run'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { SERVER_READY } from './demo-workspace'

const root = join(import.meta.dir, '../..')

// `bun run` puts node_modules/.bin first on PATH, where a peer dependency of
// bun-plugin-tailwind installs an older bun; build the client with the bun
// that launched this script, as the baseline was.
const bun =
  typeof Bun.WebView === 'function' ? process.execPath : (process.env.npm_execpath ?? 'bun')

// The client is built once for every server: the release build, with the /dev
// playground kept in.
const build = Bun.spawnSync([bun, join(root, 'scripts/build-client.ts')], {
  cwd: root,
  env: { ...process.env, MOI_DEV_ROUTES: 'true' },
  stdout: 'inherit',
  stderr: 'inherit'
})
if (build.exitCode !== 0) process.exit(build.exitCode)

try {
  process.exitCode = await run({
    // How many processes each file splits into, four in all: every process
    // starts its own Chrome at once, and a CI runner has four CPUs. The
    // playground files hold no state. app.visual.ts changes the seeded
    // workspaces in a set order, so it gets a moi of its own and runs its tests
    // in file order.
    shards: {
      'tests/visual/ui-components.visual.ts': 2,
      'tests/visual/dev-pages.visual.ts': 1,
      'tests/visual/app.visual.ts': 1
    },
    webServer: {
      command: ['bun', 'tests/visual/serve.ts'],
      // moi's own port and its control port, so servers sit 10 apart.
      port: 13437,
      env: port => ({
        MOI_CONTROL_PORT: String(port + 1),
        VISUAL_STATE_DIR: join(tmpdir(), `moi-visual-${port}`),
        VISUAL_CLIENT_BUILT: '1'
      }),
      ready: SERVER_READY,
      perShard: ['tests/visual/app.visual.ts']
    }
  })
} finally {
  // Any later non-dev `moi start` from this checkout would serve a leftover
  // dist/ (see AGENTS.md).
  await rm(join(root, 'dist'), { recursive: true, force: true })
}
