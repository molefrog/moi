import { initializeRemoteWorkspace } from '../../remote/workspace'
import { loadWorkspaceFileConfig } from '../../workspaces/layout'
import { parseRemoteWorkspaceAddress } from '@/lib/workspace-config'
import type { WorkspaceType, WorkspaceEntry } from '@/lib/types'
import { defineCommand } from 'citty'
import { existsSync } from 'node:fs'
import { join, resolve } from 'path'
import { PORT } from '../../constants'
import type { DetectedAgent } from '../../harness/detect'
import {
  agentBindingFor,
  detectHarness,
  HARNESS_TYPES,
  harnessLabel,
  isHarnessName
} from '../../harness/detect'
import { openBrowser } from '../../open-browser'
import {
  assertWorkspaceIdAvailable,
  liftToWorkspaceRoot,
  listWorkspaces,
  registerWorkspace
} from '../../workspaces/registry'
import { serverCwd } from '../../server-cwd'
import { superviseServerUpdates } from '../../update'
import { PACKAGE_ROOT } from '../../version'
import { provisionWorkspace } from '../../workspaces/init'
import { isServerRunning, registerViaControl, waitForServer } from '../control'
import pc from '../pc'
import { spawnServer } from '../server'
import { keyValue } from '../ui'

// `moi init`'s harness decision: an explicit `--harness` wins, otherwise
// auto-detection (harness/detect.ts). Exits when neither settles it — silently
// defaulting to Claude Code would install skills into `.claude/skills/` for an
// agent that reads from somewhere else entirely, which fails later and quietly.
async function resolveInitHarness(
  target: string,
  requested: string | undefined
): Promise<{ type: WorkspaceType; agent: DetectedAgent | null }> {
  if (requested !== undefined) {
    const value = requested.trim()
    if (!isHarnessName(value)) {
      console.error('\n' + pc.red('✗') + ' Unknown harness: ' + pc.bold(requested))
      console.error(pc.dim('  Valid values: ' + HARNESS_TYPES.join(', ')) + '\n')
      process.exit(1)
    }
    // An explicit choice still picks up the agent binding when the provider
    // can confirm it. It often can't — OpenClaw needs a running gateway — so a
    // miss warns rather than blocking a deliberate override.
    const agent = await agentBindingFor(value, target)
    if (!agent && (value === 'openclaw' || value === 'hermes')) {
      const noun = value === 'hermes' ? 'profile' : 'agent'
      console.log(
        '\n' +
          pc.yellow('⚠') +
          ' No ' +
          harnessLabel[value] +
          ' ' +
          noun +
          ' found at this path — registering without one.\n' +
          pc.dim('  Run ') +
          pc.bold('moi ' + value + ' init') +
          pc.dim(' to bind it once ' + harnessLabel[value] + ' can see the workspace.')
      )
    }
    return { type: value, agent }
  }

  // A registered workspace has already answered this question, and may carry no
  // on-disk signal at all (a folder created from the UI whose agent has never
  // run in it), so the registry outranks detection when re-running `moi init`
  // to refresh skills.
  const known = (await listWorkspaces()).find(e => e.path === target)
  if (known) {
    const type = known.type ?? 'claude-code'
    console.log(
      '\n' + pc.dim('  Already registered — initializing for ') + pc.bold(harnessLabel[type])
    )
    return {
      type,
      agent: known.agentId
        ? {
            agentId: known.agentId,
            ...(known.name ? { name: known.name } : {}),
            isDefault: known.isDefault ?? false,
            ...(known.lastRunAt ? { lastRunAt: known.lastRunAt } : {})
          }
        : null
    }
  }

  const detected = await detectHarness(target)
  if (detected) {
    console.log(
      '\n' +
        pc.yellow('◆') +
        ' Detected ' +
        detected.reason +
        ' — initializing for ' +
        pc.bold(harnessLabel[detected.type]) +
        '.'
    )
    return { type: detected.type, agent: detected.agent ?? null }
  }

  console.error('\n' + pc.red('✗') + ' No agent harness detected in ' + pc.bold(target))
  console.error(
    pc.dim('  Looked for a Hermes profile, an OpenClaw agent, and Codex or Claude Code history.\n')
  )
  console.error('  Pick one:\n')
  console.error(
    keyValue(
      HARNESS_TYPES.map(t => [pc.bold('moi init --harness=' + t), harnessLabel[t]]),
      '    '
    )
  )
  console.error()
  process.exit(1)
}

export const init = defineCommand({
  meta: {
    name: 'init',
    description: 'Initialize a local or remote workspace and install its skill'
  },
  args: {
    remote: { type: 'string', description: 'Remote workspace address: ownerId:workspaceId' },
    json: { type: 'boolean', description: 'Print remote initialization as JSON' },
    dir: {
      type: 'positional',
      default: '.',
      description: 'Target directory (default: current)'
    },
    harness: {
      type: 'string',
      description: 'Agent harness: ' + HARNESS_TYPES.join(', ') + ' (default: auto-detect)'
    },
    web: {
      type: 'boolean',
      default: false,
      description: 'Start the web server if not already running'
    },
    id: {
      type: 'string',
      description:
        'Register under this id instead of a generated one — fails if the workspace is already registered'
    }
  },
  async run({ args }) {
    if (
      (args.remote !== undefined && (args.harness || args.id)) ||
      (args.json && (args.remote === undefined || args.web))
    ) {
      console.error(
        '--remote cannot be combined with --harness or --id; --json requires --remote without --web'
      )
      process.exitCode = 1
      return
    }
    const requested = resolve(args.dir)
    // Locate the workspace root first: if invoked from inside a `.moi/` (or a
    // deeper accidental `.moi/.moi/…`), lift to the directory that owns it
    // instead of scaffolding a nested workspace. This is what stops the
    // `.moi/.moi` bug at the source.
    const target = liftToWorkspaceRoot(requested)
    if (target !== requested && !args.json) {
      console.log(
        '\n' +
          pc.yellow('◆') +
          ' Ran inside ' +
          pc.bold('.moi') +
          ' — using the workspace root ' +
          pc.bold(target) +
          ' instead (no nested .moi created).'
      )
    }
    // Flag a stray nested `.moi/.moi` left by the old cwd bug — harmless but
    // confusing, and easy to remove.
    const stray = join(target, '.moi', '.moi')
    if (existsSync(stray) && !args.json) {
      console.log(
        '\n' +
          pc.yellow('⚠') +
          ' Found a stray nested ' +
          pc.bold('.moi/.moi') +
          ' (from an older bug). Safe to remove:\n' +
          pc.dim('  rm -rf ' + stray)
      )
    }

    // A chosen id is only assignable at first registration, so refuse it here —
    // before any skills are copied or `.moi/` is scaffolded.
    if (args.id) {
      try {
        await assertWorkspaceIdAvailable(target, args.id)
      } catch (err) {
        console.error('\n' + pc.red('✗') + ' ' + (err as Error).message + '\n')
        process.exit(1)
      }
    }

    const projectRoot = PACKAGE_ROOT
    const isInteractive = process.stdout.isTTY

    let entry: Pick<WorkspaceEntry, 'id'>
    if (args.remote !== undefined) {
      try {
        const result = await initializeRemoteWorkspace(
          target,
          parseRemoteWorkspaceAddress(args.remote)
        )
        if (args.json) {
          console.log(JSON.stringify(result))
          return
        }
        entry = result
        console.log(pc.green('✓') + ' Initialized ' + pc.bold(result.path) + ' for ' + args.remote)
      } catch (error) {
        console.error(error instanceof Error ? error.message : 'Remote initialization failed')
        process.exitCode = 1
        return
      }
    } else {
      const config = await loadWorkspaceFileConfig(target)
      if (config.remote) {
        console.error(
          `This is a remote workspace — use moi init --remote ${config.remote.user_id}:${config.remote.workspace_id}`
        )
        process.exitCode = 1
        return
      }
      // Which backend this workspace is for has to be settled before
      // provisioning: each harness reads skills from a different directory, and
      // agent-owned ones (OpenClaw, Hermes) need their agent metadata on the
      // registry entry — same as `moi <provider> init`.
      const { type, agent } = await resolveInitHarness(target, args.harness)

      // Provision: bundled skills + the `.moi/` bootstrap (widgets dir +
      // package.json + bun install). An existing `.moi/` is left untouched.
      console.log()
      const { scaffold, skillsDir, installLogPath } = await provisionWorkspace(target, type)
      if (scaffold !== 'exists' && scaffold !== 'skipped') {
        if (scaffold === 'installing') {
          console.log(pc.dim('  Widget dependencies still installing in .moi/ (background)'))
          console.log(pc.dim('  Install log: ' + installLogPath))
        } else if (scaffold === 0) {
          console.log(pc.dim('  Installed widget dependencies in .moi/'))
        } else {
          console.warn(
            pc.yellow(`  bun install failed (exit ${scaffold}) — run it manually in .moi/`)
          )
          console.warn(pc.dim('  Install log: ' + installLogPath))
        }
      }

      // Always register the workspace in the persistent registry
      entry = await registerWorkspace(target, {
        ...(args.id ? { id: args.id } : {}),
        type,
        ...(agent
          ? {
              name: agent.name,
              agentId: agent.agentId,
              isDefault: agent.isDefault,
              lastRunAt: agent.lastRunAt
            }
          : {})
      })

      console.log(pc.green('✓') + ' Initialized ' + pc.bold(target) + pc.dim(' (' + type + ')'))
      console.log(
        '  Skills installed to ' +
          pc.dim(skillsDir) +
          ' — ask ' +
          (type === 'claude-code' ? 'Claude' : 'your agent') +
          ' to build a widget or a view to get started\n'
      )
    }

    // If --web and server not running, start it (stay alive as wrapper)
    let running = await isServerRunning()

    if (!running && args.web) {
      console.log(pc.dim('  Starting server…'))
      const cwd = serverCwd(projectRoot, false)
      const proc = spawnServer(cwd)
      running = await waitForServer()
      if (!running) {
        console.error(pc.red('  Server failed to start\n'))
        await proc.exited
        process.exit(1)
      }
      const url = `http://localhost:${PORT}/workspace/${entry.id}`
      console.log(pc.green('✓') + ' Server started on http://localhost:' + PORT)
      if (isInteractive) console.log('  Opening ' + pc.bold(url))
      console.log(pc.dim('  Press Ctrl+C to stop\n'))
      if (isInteractive) await openBrowser(url)
      process.exit(await superviseServerUpdates(proc, () => spawnServer(cwd)))
    }

    if (running) {
      // Server already running — notify it and open (browser only in interactive mode)
      await registerViaControl(target)
      const url = `http://localhost:${PORT}/workspace/${entry.id}`
      if (isInteractive) {
        console.log('  Opening ' + pc.bold(url) + '\n')
        await openBrowser(url)
      } else {
        console.log('  Ready at ' + pc.bold(url) + '\n')
      }
      process.exit(0)
    }

    // Server not running and --web not passed
    console.log('  Run ' + pc.bold('moi start') + ' to open in the browser\n')
  }
})
