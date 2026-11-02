import { expect, test } from 'bun:test'
import { canReadTool } from './run-action'

test('discovery refuses writes, shell commands, and unannotated connector tools', () => {
  expect(canReadTool('Read')).toBe(true)
  expect(canReadTool('Bash')).toBe(false)
  expect(canReadTool('Write')).toBe(false)
  expect(canReadTool('mcp__test__search')).toBe(false)
  expect(canReadTool('mcp__test__search', { readOnly: true })).toBe(true)
  expect(canReadTool('mcp__test__delete', { readOnly: true, destructive: true })).toBe(false)
})
