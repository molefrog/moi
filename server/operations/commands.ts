import { join } from 'node:path'
import { PACKAGE_ROOT } from '../version'
import { OperationError } from './files'

export const workspaceCommands = [
  'bundle',
  'check',
  'call-server-fn',
  'theme',
  'ui-components',
  'views',
  'debug'
] as const

export function commandArguments(command: string, args: string[]): string[] {
  if (
    !(workspaceCommands as readonly string[]).includes(command) ||
    (command === 'debug' && args[0] !== 'logs')
  )
    throw new OperationError('Unsupported workspace command')
  // The target comes from the URL. Do not let command flags switch workspace.
  if (args.some(arg => /^--(?:dir|path)(?:=|$)/.test(arg)))
    throw new OperationError('Workspace is selected by the remote link, not --dir or --path')
  if (['bundle', 'check', 'views'].includes(command)) {
    // These commands use a positional directory, unlike the other commands.
    const index = command === 'views' ? (args[0] === 'set' ? 2 : 1) : 0
    const result = [...args]
    result.splice(index, 0, '.')
    return [command, ...result]
  }
  return [command, ...args]
}

export function spawnWorkspaceCommand(root: string, command: string, args: string[]) {
  return Bun.spawn(
    [process.execPath, join(PACKAGE_ROOT, 'server/cli.ts'), ...commandArguments(command, args)],
    {
      cwd: root,
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      detached: true,
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', MOI_REMOTE_WORKSPACE: root }
    }
  )
}
