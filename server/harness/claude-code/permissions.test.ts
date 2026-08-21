import { expect, test } from 'bun:test'

import { claudeSessionAccessOptions } from './permissions'

test('Claude Code uses reviewed auto access without the dangerous bypass flag', () => {
  const options = claudeSessionAccessOptions()

  expect(options).toEqual({ permissionMode: 'auto' })
  expect('allowDangerouslySkipPermissions' in options).toBe(false)
})
