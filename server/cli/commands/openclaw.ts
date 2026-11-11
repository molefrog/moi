import { defineCommand } from 'citty'
import { PORT } from '../../constants'
import type { OpenClawAgent } from '../../harness/openclaw/discovery'
import { discoverOpenClawAgents } from '../../harness/openclaw/discovery'
import { openBrowser } from '../../open-browser'
import { registerWorkspace } from '../../workspaces/registry'
import { provisionWorkspace } from '../../workspaces/init'
import { isServerRunning, registerViaControl } from '../control'
import pc from '../pc'
import { initHint, printProviderCommands } from '../provider'
import { columns } from '../ui'

// Match an `agent` argument against `agentId` (exact) or `name`
// (case-insensitive). Returns the matching agent or null.
function findAgent(agents: OpenClawAgent[], query: string): OpenClawAgent | null {
  const exact = agents.find(a => a.agentId === query)
  if (exact) return exact
  const q = query.toLowerCase()
  return agents.find(a => a.name?.toLowerCase() === q) ?? null
}

function printAgentTable(agents: OpenClawAgent[]) {
  console.log(
    columns(
      ['', 'agentId', 'name', 'workspace'].map(h => pc.dim(h)),
      agents.map(a => [
        a.isDefault ? pc.green('●') : ' ',
        a.isDefault ? pc.bold(a.agentId) : a.agentId,
        a.name ?? pc.dim('—'),
        pc.dim(a.path)
      ])
    )
  )
}

const openclawInit = defineCommand({
  meta: {
    name: 'init',
    description:
      'Install Moi skills into an OpenClaw agent workspace. Run without args to list discovered agents.'
  },
  args: {
    agent: {
      type: 'positional',
      required: false,
      description: 'Agent id or name (omit to list agents)'
    }
  },
  async run({ args }) {
    const agents = await discoverOpenClawAgents()
    if (agents.length === 0) {
      console.error(
        '\n' +
          pc.red('✗') +
          ' No OpenClaw agents discovered.\n' +
          pc.dim(
            '  Make sure the OpenClaw gateway is running and ~/.openclaw/openclaw.json is set.\n'
          )
      )
      process.exit(1)
    }

    // No argument: with a single agent there is nothing to choose, so install
    // into it. Only an ambiguous choice needs the list.
    if (!args.agent && agents.length > 1) {
      console.log('\n' + pc.bold('OpenClaw agents'))
      console.log(
        pc.dim('  Run ' + pc.bold('moi openclaw init <agentId>') + ' to install skills.\n')
      )
      printAgentTable(agents)
      console.log()
      process.exit(0)
    }

    const target = args.agent ? findAgent(agents, args.agent) : agents[0]
    if (!target) {
      console.error('\n' + pc.red('✗') + ' Agent not found: ' + pc.bold(args.agent) + '\n')
      console.log('  Available:\n')
      printAgentTable(agents)
      console.log()
      process.exit(1)
    }

    // Shared provisioning path with `moi init`: skills land in
    // <agent-workspace>/skills/<name>/ (OpenClaw resolves <workspace>/skills
    // with the highest precedence, so these win over any same-named bundled or
    // per-user skill), plus the `.moi/` bootstrap — the widgets skill assumes
    // the folder and its dependencies exist. Existing `.moi/` stays untouched.
    const {
      scaffold,
      skillsDir: skillsRoot,
      installLogPath
    } = await provisionWorkspace(target.path, 'openclaw')
    if (scaffold !== 'exists' && scaffold !== 'skipped') {
      if (scaffold === 'installing') {
        console.log('\n' + pc.dim('  Widget dependencies still installing in .moi/ (background)'))
        console.log(pc.dim('  Install log: ' + installLogPath))
      } else if (scaffold === 0) {
        console.log('\n' + pc.dim('  Installed widget dependencies in .moi/'))
      } else {
        console.warn(
          '\n' + pc.yellow(`  bun install failed (exit ${scaffold}) — run it manually in .moi/`)
        )
        console.warn(pc.dim('  Install log: ' + installLogPath))
      }
    }

    // Register in the moi registry so the agent's workspace appears in the
    // UI workspace list. Mirrors what `moi init` does for Claude Code.
    const entry = await registerWorkspace(target.path, {
      type: 'openclaw',
      name: target.name,
      agentId: target.agentId,
      isDefault: target.isDefault,
      lastRunAt: target.lastRunAt
    })

    console.log('\n' + pc.green('✓') + ' Installed skills to ' + pc.bold(skillsRoot))
    console.log(
      pc.dim('  Agent: ') +
        pc.bold(target.agentId) +
        (target.name ? pc.dim(' (' + target.name + ')') : '')
    )
    const isInteractive = process.stdout.isTTY
    const running = await isServerRunning()
    if (running) {
      const url = `http://localhost:${PORT}/workspace/${entry.id}`
      // Notify the running server so it picks up the new entry without a
      // restart, then open (browser only in interactive mode) — same shape
      // as `moi init`'s already-running branch.
      await registerViaControl(target.path)
      if (isInteractive) {
        console.log('  Opening ' + pc.bold(url) + '\n')
        await openBrowser(url)
      } else {
        console.log('  Ready at ' + pc.bold(url) + '\n')
      }
    } else {
      console.log('  Run ' + pc.bold('moi start') + ' to open in the browser\n')
    }
    process.exit(0)
  }
})

export const openclaw = defineCommand({
  meta: { name: 'openclaw', description: 'OpenClaw integration commands' },
  async run({ rawArgs }) {
    // citty runs the parent even after dispatching a subcommand — the bare
    // form is the only one this handles.
    if (rawArgs.some(arg => !arg.startsWith('-'))) return
    console.log('\n' + pc.bold('OpenClaw'))
    printProviderCommands('openclaw', '[agent]')
    const agents = await discoverOpenClawAgents().catch(() => [])
    if (agents.length === 0) {
      console.log(
        '\n  ' +
          pc.dim('No agents discovered — start the OpenClaw gateway and check ') +
          pc.dim('~/.openclaw/openclaw.json') +
          '\n'
      )
      return
    }
    console.log('\n' + pc.bold('  Agents'))
    printAgentTable(agents)
    console.log(pc.dim('\n  Run ') + pc.bold(initHint('openclaw', agents.length, 'agentId')) + '\n')
  },
  subCommands: { init: openclawInit }
})
