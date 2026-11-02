import { expect, test } from 'bun:test'
import { codexActionCommand } from './run-action'

test('actions use an ephemeral read-only process', () => {
  const command = codexActionCommand('codex', '/tmp/action', '/tmp/schema', '/tmp/result')
  expect(command).toContain('--ephemeral')
  expect(command).toContain('read-only')
  expect(command).toContain('approval_policy="never"')
  expect(command).toContain('--ignore-user-config')
})
