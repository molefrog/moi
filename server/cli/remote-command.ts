import type { ArgsDef, CommandDef } from 'citty'
import { resolve } from 'node:path'
import { runLinkedWorkspaceCommand } from './remote-operations'

// Keep each command's existing parser and help. Only its execution changes when
// the selected folder is linked, including nested commands such as scratch add.
export function remoteWorkspaceCommand<T extends ArgsDef>(
  name: string,
  command: CommandDef<T>,
  prefix: string[] = []
): CommandDef<T> {
  const original = command.run
  return {
    ...command,
    ...(command.subCommands
      ? {
          subCommands: async () => {
            const source =
              typeof command.subCommands === 'function'
                ? await command.subCommands()
                : await command.subCommands
            const children: NonNullable<typeof source> = {}
            for (const [key, value] of Object.entries(source ?? {})) {
              const child = typeof value === 'function' ? await value() : await value
              children[key] = remoteWorkspaceCommand(name, child, [...prefix, key])
            }
            return children
          }
        }
      : {}),
    async run(context) {
      if (command.subCommands && context.args._.length) return original?.(context)
      const args = context.args as Record<string, unknown>
      const folder = resolve(typeof args.dir === 'string' ? args.dir : process.cwd())
      const definitions =
        typeof command.args === 'function' ? await command.args() : await command.args
      const positionalDir = Object.entries(definitions ?? {})
        .filter(([, def]) => def.type === 'positional')
        .findIndex(([key]) => key === 'dir')
      let position = 0
      const forwarded: string[] = []
      for (let i = 0; i < context.rawArgs.length; i++) {
        const arg = context.rawArgs[i]!
        if (arg === '--dir') {
          i++
          continue
        }
        if (arg.startsWith('--dir=')) continue
        if (arg.startsWith('-') && arg !== '-') {
          forwarded.push(arg)
          const option = arg.replace(/^--?/, '').split('=')[0]!
          if (
            !arg.includes('=') &&
            definitions?.[option]?.type === 'string' &&
            context.rawArgs[i + 1] !== undefined
          )
            forwarded.push(context.rawArgs[++i]!)
        } else if (position++ !== positionalDir) forwarded.push(arg)
      }
      try {
        if (await runLinkedWorkspaceCommand(name, [...prefix, ...forwarded], folder)) return
      } catch (error) {
        console.error(error instanceof Error ? error.message : 'Remote command failed')
        process.exitCode = 1
        return
      }
      return original?.(context)
    }
  }
}
