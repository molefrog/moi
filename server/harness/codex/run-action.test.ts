import { expect, test } from 'bun:test'
import { codexActionCommand } from './run-action'

test('actions use an ephemeral read-only process', () => {
  const command = codexActionCommand('codex', '/tmp/action', '/tmp/schema', '/tmp/result')
  expect(command).toContain('--ephemeral')
  expect(command).toContain('read-only')
  expect(command).toContain('approval_policy="never"')
  expect(command).toContain('--ignore-user-config')
  expect(command.some(arg => arg.startsWith('mcp_servers.'))).toBe(false)
})

test('progress-enabled actions configure their own reporting endpoint', () => {
  const command = codexActionCommand(
    'codex',
    '/tmp/action',
    '/tmp/schema',
    '/tmp/result',
    'http://127.0.0.1:1234/action'
  )
  expect(command).toContain('mcp_servers.moi_action.url="http://127.0.0.1:1234/action"')
  expect(command).toContain('approval_policy="never"')
  expect(command).toContain('read-only')
})
