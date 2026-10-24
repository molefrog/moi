import { defineCommand, runMain, showUsage } from 'citty'
import { isAgentCaller } from '../agent-caller'
import { getAppConfig } from '../app-config'
import { canUseDataDir } from '../data-dir'
import { versionWithCommit } from '../version'
import { bundle } from './commands/bundle'
import { callServerFn } from './commands/call-server-fn'
import { call } from './commands/call'
import { tools } from './commands/tools'
import { check } from './commands/check'
import { config, printConfigHelp } from './commands/config'
import { debug } from './commands/debug'
import { env } from './commands/env'
import { hermes } from './commands/hermes'
import { init } from './commands/init'
import { navigate } from './commands/navigate'
import { openclaw } from './commands/openclaw'
import { refresh } from './commands/refresh'
import { scratch } from './commands/scratch'
import { service } from './commands/service'
import { skill } from './commands/skill'
import { start } from './commands/start'
import { status } from './commands/status'
import { tabs } from './commands/tabs'
import { theme } from './commands/theme'
import { uiComponents } from './commands/ui-components'
import { update } from './commands/update'
import { version } from './commands/version'
import { views } from './commands/views'
import pc from './pc'

// The root help splits the surface by audience: workspace commands are the
// agent's day-to-day toolkit (skills tell it to run them); system commands
// manage Moi itself and are for the human at the keyboard.
const workspaceCommands = {
  bundle,
  check,
  refresh,
  views,
  'call-server-fn': callServerFn,
  tools,
  call,
  debug,
  theme,
  config,
  env,
  scratch,
  skill,
  tabs,
  navigate,
  'ui-components': uiComponents
}

const systemCommands = {
  init,
  start,
  status,
  service,
  update,
  openclaw,
  hermes,
  version
}

const main = defineCommand({
  // A function so the git lookup runs only for `moi --version` / `--help`, not on
  // every command. citty resolves a function meta (used for --version + usage).
  meta: () => ({
    name: 'moi',
    description: 'Moi — local AI workspace',
    version: versionWithCommit()
  }),
  subCommands: { ...workspaceCommands, ...systemCommands }
})

// Cloud demo: system commands manage Moi itself (service, updates, agent
// runtimes) — in a demo container the instance is provisioned, not managed,
// so they print a pointer to the real thing instead of running. Two stay:
// `start`, because it is how the demo (container or a local test run) boots
// at all — against an already-running server it just reports and exits — and
// `version`, which is harmless and useful in bug reports.
function exitIfDemoBlocked(): void {
  const invoked = process.argv[2]
  if (!invoked || invoked === 'version' || invoked === 'start') return
  if (!(invoked in systemCommands)) return
  // The agent on a managed machine can't read the config (see below).
  if (!canUseDataDir()) return
  const config = getAppConfig()
  if (!config.demo) return
  console.log(
    '\n' +
      pc.yellow('◆') +
      ` moi ${invoked} is not available in the demo.\n` +
      pc.dim('  Get Moi on your computer: ') +
      pc.bold(config.demoInstallUrl) +
      '\n'
  )
  process.exit(1)
}

// Managed machines run the agent as its own OS user, which can't open moi's
// data folder (docs/config.md). The system commands that set up or
// run moi belong to the user that runs moi; `version` and `status` only read.
function exitIfNotMoiUser(): void {
  const invoked = process.argv[2]
  if (!invoked || invoked === 'version' || invoked === 'status') return
  if (!(invoked in systemCommands)) return
  if (canUseDataDir()) return
  console.log(
    '\n' + pc.yellow('◆') + ` moi ${invoked} is only available to the user that runs moi.\n`
  )
  process.exit(1)
}

exitIfNotMoiUser()

exitIfDemoBlocked()

type HelpCommand = { meta?: unknown }

async function commandDescription(cmd: HelpCommand): Promise<string> {
  const meta = typeof cmd.meta === 'function' ? await cmd.meta() : await cmd.meta
  return (meta as { description?: string })?.description ?? ''
}

// Two-section root help (replaces citty's flat list). For a human, the
// system section carries an explicit note that agents should leave those
// commands alone; for a detected agent caller, the section is omitted
// entirely — an agent's `moi --help` shows only the workspace toolkit.
async function printMainHelp() {
  const pad =
    Math.max(...Object.keys({ ...workspaceCommands, ...systemCommands }).map(n => n.length)) + 4
  const row = async (name: string, cmd: HelpCommand) =>
    '  ' + pc.cyan(name.padEnd(pad)) + pc.dim(await commandDescription(cmd))
  console.log()
  console.log(
    pc.bold('Moi') + pc.dim(' — local AI workspace  ') + pc.dim(`v${versionWithCommit()}`)
  )
  console.log()
  console.log(pc.dim('USAGE  ') + 'moi <command> [options]')
  console.log()
  console.log(pc.bold('Workspace commands:') + pc.dim(' for agents and humans alike'))
  console.log()
  for (const [name, cmd] of Object.entries(workspaceCommands)) console.log(await row(name, cmd))
  console.log()
  if (!isAgentCaller()) {
    console.log(
      pc.bold('System commands:') + pc.dim(' manage Moi itself (server, service, updates)')
    )
    console.log(pc.yellow('  AGENTS: do not run these unless explicitly asked!'))
    console.log()
    for (const [name, cmd] of Object.entries(systemCommands)) console.log(await row(name, cmd))
    console.log()
  }
  console.log(pc.dim('Use moi <command> --help for more information about a command.'))
  console.log()
}

// Route `moi --help` (and bare `moi`) to the two-section help, and
// `moi config --help` to its terse cheat sheet; every other command keeps
// citty's default usage renderer.
runMain(main, {
  async showUsage(cmd, parent) {
    const meta = typeof cmd.meta === 'function' ? await cmd.meta() : await cmd.meta
    if (meta?.name === 'moi') {
      await printMainHelp()
      return
    }
    if (meta?.name === 'config') {
      printConfigHelp()
      return
    }
    await showUsage(cmd, parent)
  }
})
