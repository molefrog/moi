import { join } from 'node:path'
import { runHarnessCommand } from '../command'
import type { HarnessActionInput } from '../types'
import { requireHarnessExecutable } from '../executable'
import { actionProgressServerName, executeHarnessAction } from '../run-action'
export function codexActionCommand(
  executable: string,
  cwd: string,
  schema: string,
  output: string,
  progressUrl?: string
): string[] {
  return [
    executable,
    'exec',
    '--ephemeral',
    '--ignore-user-config',
    '--ignore-rules',
    '--strict-config',
    '--skip-git-repo-check',
    '--sandbox',
    'read-only',
    '--cd',
    cwd,
    '--output-schema',
    schema,
    '--output-last-message',
    output,
    '-c',
    'approval_policy="never"',
    // Native connected apps may read; writes require approval and this headless
    // action never grants it. User MCP configs/hooks cannot override this policy.
    '-c',
    'apps._default.default_tools_approval_mode="writes"',
    '-c',
    'apps._default.destructive_enabled=false',
    '-c',
    'apps._default.open_world_enabled=false',
    '-c',
    'features.js_repl=false',
    '-c',
    'features.multi_agent=false',
    '-c',
    'notify=[]',
    ...(progressUrl
      ? ['-c', `mcp_servers.${actionProgressServerName}.url=${JSON.stringify(progressUrl)}`]
      : []),
    '-'
  ]
}

export async function runCodexAction<TResult, TProgress = never>(
  input: HarnessActionInput<TResult, TProgress>
): Promise<TResult> {
  return executeHarnessAction(input, async action => {
    const { cwd } = action
    const schema = join(cwd, 'schema.json'),
      output = join(cwd, 'result.json')
    await Bun.write(schema, JSON.stringify(action.resultSchema))
    const result = await runHarnessCommand({
      command: codexActionCommand(
        requireHarnessExecutable('codex'),
        cwd,
        schema,
        output,
        action.progressUrl
      ),
      cwd,
      stdin: action.prompt,
      signal: input.signal,
      env: Object.fromEntries(
        Object.entries(process.env).filter(
          ([key]) => !key.startsWith('CODEX_') || key === 'CODEX_HOME' || key === 'CODEX_API_KEY'
        )
      )
    })
    if (result === null) throw new Error('The agent could not complete the action')
    return JSON.parse(await Bun.file(output).text())
  })
}
