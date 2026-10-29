import type { ExperimentalFeatures } from '@/lib/experimental'
import { EXPERIMENTAL_FEATURES, experimentalFlagName } from '@/lib/experimental'
import { defineCommand } from 'citty'
import { getAppConfig, initializeAppConfig } from '../../app-config'
import { CONTROL_PORT, PORT } from '../../constants'
import { serverCwd } from '../../server-cwd'
import { queryServerInfo, webAddress } from '../../service'
import { superviseServerUpdates } from '../../update'
import { PACKAGE_ROOT } from '../../version'
import { isServerRunning } from '../control'
import { assertDevRuntime } from '../dev-runtime'
import pc from '../pc'
import { runDevSupervisor, spawnServer } from '../server'

const experimentalArgs = Object.fromEntries(
  EXPERIMENTAL_FEATURES.map(feature => {
    const name = experimentalFlagName(feature)
    const label = name.slice('experimental-'.length).replaceAll('-', ' ')
    return [name, { type: 'boolean' as const, description: `Enable experimental ${label}` }]
  })
)

export const start = defineCommand({
  meta: { name: 'start', description: 'Start the Moi web server' },
  args: {
    port: {
      type: 'string',
      description: 'HTTP port to listen on (default: 13337)'
    },
    ...experimentalArgs
  },
  async run({ args, rawArgs }) {
    const knownFlags = new Set(EXPERIMENTAL_FEATURES.map(experimentalFlagName))
    for (const arg of rawArgs) {
      if (arg.startsWith('--experimental-') && !knownFlags.has(arg.slice(2))) {
        throw new Error(`Unknown experimental feature: ${arg.slice('--experimental-'.length)}`)
      }
    }
    const experimental: Partial<ExperimentalFeatures> = {}
    const experimentalFlags: string[] = []
    for (const feature of EXPERIMENTAL_FEATURES) {
      const flag = experimentalFlagName(feature)
      if (args[flag] !== true) continue
      experimental[feature] = true
      experimentalFlags.push(`--${flag}`)
    }
    const projectRoot = PACKAGE_ROOT
    // Undocumented: --dev runs the watch-and-full-restart dev supervisor.
    const dev = process.argv.includes('--dev')
    if (dev) assertDevRuntime()
    // Undocumented: --debug turns on the messaging trace (MOI_DEBUG) in the
    // server — console lines for each message/session/turn in the chat pipeline.
    const debug = process.argv.includes('--debug')

    // Launcher path: we are the CLI, not the server. Decide whether to bail
    // (a server is already up), run the dev supervisor, or spawn a one-shot
    // server. Skipped when MOI_SERVER=1 (we are the spawned server itself).
    if (!process.env.MOI_SERVER) {
      if (await isServerRunning()) {
        // Say who owns the running server: a service-managed one is expected
        // to be here, and `moi service` is how to manage it.
        const info = await queryServerInfo()
        if (info?.service) {
          console.log(
            '\n' +
              pc.yellow('◆') +
              ' The Moi service is already running on ' +
              webAddress(info) +
              pc.dim(` (v${info.version})`) +
              '\n' +
              pc.dim('  Manage it with `moi service` — restart, logs, uninstall.') +
              '\n'
          )
        } else {
          console.log(
            '\n' + pc.yellow('◆') + ' Server is already running on ' + webAddress(info) + '\n'
          )
        }
        process.exit(0)
      }

      // Spawn server with correct cwd so bunfig.toml is picked up at Bun startup.
      // MOI_DEV tells the server to use the live bundler + HMR even if a stale
      // `dist/` exists in the tree (prod serves prebuilt `dist/` statically).
      const env = {
        ...process.env,
        // The dev bundler snapshots process.env at server startup, so the
        // PUBLIC_* inlining (bunfig `[serve.static] env`) only sees vars that
        // are set before the server process spawns — setting one later from
        // server code does nothing. Default the tldraw key here so an unset
        // key inlines as '' (→ watermark) instead of leaving a bare
        // `process.env.…` in the browser bundle that throws.
        PUBLIC_TLDRAW_LICENSE_KEY: process.env.PUBLIC_TLDRAW_LICENSE_KEY ?? '',
        ...(args.port ? { PORT: args.port } : {}),
        ...(dev ? { MOI_DEV: '1' } : {}),
        ...(debug ? { MOI_DEBUG: '1' } : {})
      }
      if (dev) {
        await runDevSupervisor(projectRoot, env, experimentalFlags)
        return
      }
      const cwd = serverCwd(projectRoot, dev)
      const proc = spawnServer(cwd, env, experimentalFlags)
      process.exit(
        await superviseServerUpdates(proc, () => spawnServer(cwd, env, experimentalFlags))
      )
    }

    // This IS the server process (MOI_SERVER=1). cwd is the package root when the
    // dev bundler runs (bunfig loaded at Bun startup) or a neutral dir for a
    // prebuilt install — see serverCwd().
    initializeAppConfig(experimental)
    try {
      await import('../../web')
    } catch (err) {
      // Startup failure (port taken, config error). Under the service manager
      // exit 0 on purpose: launchd (KeepAlive.SuccessfulExit=false) and
      // systemd (Restart=on-failure) both read a clean exit as "do not
      // respawn", so a permanently-broken start idles instead of looping.
      const code = (err as { code?: string })?.code
      if (code === 'EADDRINUSE') {
        console.error(
          `\n${pc.red('✗')} Port already in use (http :${PORT} / control :${CONTROL_PORT}) — ` +
            'is another Moi server running?'
        )
      } else {
        console.error(`\n${pc.red('✗')} Server failed to start: ${String(err)}`)
      }
      if (process.env.MOI_SERVICE) {
        console.error(pc.dim('  The service stays idle — fix this, then `moi service restart`.\n'))
        process.exit(0)
      }
      process.exit(1)
    }
    const { unixSocket } = getAppConfig()
    console.log(`\n${pc.green('✓')} Server started on ${unixSocket ?? `http://localhost:${PORT}`}`)
    console.log(pc.dim('  Press Ctrl+C to stop\n'))
    // Stay alive as the server
  }
})
