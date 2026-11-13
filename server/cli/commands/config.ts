import { defineCommand } from 'citty'
import { resolve } from 'path'
import { sendControl } from '../control'
import pc from '../pc'

async function sendConfig(payload: {
  path: string
  name?: string
  iconPath?: string
  clearName?: boolean
  clearIcon?: boolean
}) {
  await sendControl(payload.path, { type: 'config', ...payload }, res => {
    console.log()
    if (res.ok) {
      if (res.clearedName) console.log(pc.green('✓') + ' Name reset to ' + pc.dim('(folder name)'))
      else if (res.name) console.log(pc.green('✓') + ' Name set to ' + pc.bold(String(res.name)))
      if (res.clearedIcon)
        console.log(pc.green('✓') + ' Icon reset to ' + pc.dim('default (provider)'))
      else if (res.icon) console.log(pc.green('✓') + ' Icon updated ' + pc.dim('(128×128 webp)'))
    } else {
      console.log(pc.bold('moi config') + ' — workspace identity\n')
      console.log(
        '  ' +
          pc.dim('name') +
          '  ' +
          (res.name ? pc.bold(String(res.name)) : pc.dim('(folder name)'))
      )
      console.log(
        '  ' +
          pc.dim('icon') +
          '  ' +
          (res.hasIcon ? pc.green('custom') : pc.dim('default (provider)'))
      )
    }
    console.log()
  })
}

// A terse cheat sheet — one line per command — so an agent can grasp the
// surface at a glance instead of parsing citty's full ARGUMENTS/OPTIONS dump.
export function printConfigHelp() {
  const row = (cmd: string, desc: string) => '  ' + pc.cyan(cmd.padEnd(34)) + pc.dim(desc)
  console.log()
  console.log(pc.bold('moi config') + pc.dim(' — workspace name & icon'))
  console.log()
  console.log(row('moi config', 'Show current name & icon'))
  console.log(row('moi config name "My WS"', 'Set the display name'))
  console.log(row('moi config name --clear', 'Reset name to folder default'))
  console.log(row('moi config icon ./logo.png', 'Set icon (png/jpg/gif/webp → 128×128 webp)'))
  console.log(row('moi config icon --clear', 'Reset icon to provider default'))
  console.log(row('  --dir <path>', 'Target workspace (default: current dir)'))
  console.log()
}

export const config = defineCommand({
  meta: {
    name: 'config',
    description: 'Show or set the workspace name and icon (moi config [name|icon] <value>)'
  },
  args: {
    field: {
      type: 'positional',
      required: false,
      description: '"name" or "icon" — omit to show the current config'
    },
    value: {
      type: 'positional',
      required: false,
      description: 'The new name, or a path to an image file (png/jpg/gif/webp)'
    },
    clear: {
      type: 'boolean',
      description: 'Reset the field to its default (folder name / provider icon)'
    },
    dir: { type: 'string', default: '.', description: 'Workspace directory (default: current)' }
  },
  run({ args }) {
    const path = resolve(args.dir)
    if (args.field === 'help') {
      printConfigHelp()
      return
    }
    if (!args.field) {
      sendConfig({ path })
      return
    }
    if (args.field === 'name') {
      if (args.clear) {
        sendConfig({ path, clearName: true })
        return
      }
      if (!args.value) {
        console.error(pc.red('Usage:') + ' moi config name "<workspace name>"')
        process.exit(1)
      }
      sendConfig({ path, name: args.value })
    } else if (args.field === 'icon') {
      if (args.clear) {
        sendConfig({ path, clearIcon: true })
        return
      }
      if (!args.value) {
        console.error(pc.red('Usage:') + ' moi config icon <path-to-image>')
        process.exit(1)
      }
      sendConfig({ path, iconPath: resolve(args.value) })
    } else {
      console.error(
        pc.red(`Unknown field "${args.field}".`) +
          ' Use ' +
          pc.bold('name') +
          ' or ' +
          pc.bold('icon') +
          '.'
      )
      process.exit(1)
    }
  }
})
