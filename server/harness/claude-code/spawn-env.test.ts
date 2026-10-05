import { expect, test } from 'bun:test'

import { claudeSpawnEnv } from './spawn-env'

const parentEnv = { PATH: '/usr/bin', CLAUDECODE: '1', HOME: '/home/tom' }

test('drops CLAUDECODE inherited from a moi server started inside Claude Code', () => {
  const env = claudeSpawnEnv({}, parentEnv)
  expect(env.CLAUDECODE).toBeUndefined()
  expect('CLAUDECODE' in env).toBe(true)
  expect(env.PATH).toBe('/usr/bin')
})

test('keeps workspace env keys alongside the parent env', () => {
  const env = claudeSpawnEnv({ ANTHROPIC_API_KEY: 'sk-test' }, parentEnv)
  expect(env.ANTHROPIC_API_KEY).toBe('sk-test')
  expect(env.HOME).toBe('/home/tom')
})

test('lets workspace env override the parent env', () => {
  const env = claudeSpawnEnv({ HOME: '/workspace' }, parentEnv)
  expect(env.HOME).toBe('/workspace')
})

test('preserves the extra keys callers add next to the workspace env', () => {
  const env = claudeSpawnEnv({ MOI_AGENT: '1', DISABLE_AUTOUPDATER: '1' }, parentEnv)
  expect(env.MOI_AGENT).toBe('1')
  expect(env.DISABLE_AUTOUPDATER).toBe('1')
  expect(env.CLAUDECODE).toBeUndefined()
})

test('never lets a caller reinstate CLAUDECODE', () => {
  expect(claudeSpawnEnv({ CLAUDECODE: '1' }, parentEnv).CLAUDECODE).toBeUndefined()
})
