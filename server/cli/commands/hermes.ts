import { defineCommand } from 'citty'
import { PORT } from '../../constants'
import type { HermesProfile } from '../../harness/hermes/discovery'
import { discoverHermesProfiles, matchHermesProfile } from '../../harness/hermes/discovery'
import { openBrowser } from '../../open-browser'
import { registerWorkspace } from '../../workspaces/registry'
import { provisionWorkspace } from '../../workspaces/init'
import { isServerRunning, registerViaControl } from '../control'
import pc from '../pc'
import { initHint, printProviderCommands } from '../provider'
import { columns } from '../ui'

function printProfileTable(profiles: HermesProfile[]) {
  console.log(
    columns(
      ['', 'profile', 'model', 'workspace'].map(h => pc.dim(h)),
      profiles.map(p => [
        p.isDefault ? pc.green('●') : ' ',
        p.isDefault ? pc.bold(p.agentId) : p.agentId,
        p.model ?? pc.dim('—'),
        pc.dim(p.path)
      ])
    )
  )
}

const hermesInit = defineCommand({
  meta: {
    name: 'init',
    description:
      'Install Moi skills into a Hermes profile workspace. Run without args to list discovered profiles.'
  },
  args: {
    profile: {
      type: 'positional',
      required: false,
      description: 'Profile id or description (omit to list profiles)'
    }
  },
  async run({ args }) {
    const profiles = await discoverHermesProfiles()
    if (profiles.length === 0) {
      console.error(
        '\n' +
          pc.red('✗') +
          ' No Hermes profiles discovered.\n' +
          pc.dim('  Install Hermes and run ' + pc.bold('hermes setup') + ' first.\n')
      )
      process.exit(1)
    }

    // No argument: with a single profile there is nothing to choose, so
    // install into it. Only an ambiguous choice needs the list.
    if (!args.profile && profiles.length > 1) {
      console.log('\n' + pc.bold('Hermes profiles'))
      console.log(pc.dim('  Run ' + pc.bold('moi hermes init <profile>') + ' to install skills.\n'))
      printProfileTable(profiles)
      console.log()
      process.exit(0)
    }

    const target = args.profile ? matchHermesProfile(profiles, args.profile) : profiles[0]
    if (!target) {
      console.error('\n' + pc.red('✗') + ' Profile not found: ' + pc.bold(args.profile) + '\n')
      console.log('  Available:\n')
      printProfileTable(profiles)
      console.log()
      process.exit(1)
    }

    // Shared provisioning path with `moi init`: skills land in
    // <profile>/workspace/skills/<name>/ (Hermes resolves the workspace skills
    // dir with the highest precedence, so these win over bundled ones), plus
    // the `.moi/` bootstrap. The default profile has no workspace directory
    // until now — provisionWorkspace creates it.
    const {
      scaffold,
      skillsDir: skillsRoot,
      installLogPath
    } = await provisionWorkspace(target.path, 'hermes')
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

    const entry = await registerWorkspace(target.path, {
      type: 'hermes',
      name: target.name,
      agentId: target.agentId,
      isDefault: target.isDefault
    })

    console.log('\n' + pc.green('✓') + ' Installed skills to ' + pc.bold(skillsRoot))
    console.log(
      pc.dim('  Profile: ') +
        pc.bold(target.agentId) +
        (target.model ? pc.dim(' (' + target.model + ')') : '')
    )
    const isInteractive = process.stdout.isTTY
    const running = await isServerRunning()
    if (running) {
      const url = `http://localhost:${PORT}/workspace/${entry.id}`
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

export const hermes = defineCommand({
  meta: { name: 'hermes', description: 'Hermes Agent integration commands' },
  async run({ rawArgs }) {
    // citty runs the parent even after dispatching a subcommand — the bare
    // form is the only one this handles.
    if (rawArgs.some(arg => !arg.startsWith('-'))) return
    console.log('\n' + pc.bold('Hermes'))
    printProviderCommands('hermes', '[profile]')
    const profiles = await discoverHermesProfiles().catch(() => [])
    if (profiles.length === 0) {
      console.log(
        '\n  ' +
          pc.dim('No profiles discovered — install Hermes and run ') +
          pc.dim('hermes setup') +
          '\n'
      )
      return
    }
    console.log('\n' + pc.bold('  Profiles'))
    printProfileTable(profiles)
    console.log(pc.dim('\n  Run ') + pc.bold(initHint('hermes', profiles.length, 'profile')) + '\n')
  },
  subCommands: { init: hermesInit }
})
