import { expect, test } from 'bun:test'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'path'

import { loadAppConfig } from './app-config'

const NO_ENV: Record<string, string | undefined> = {}

async function configFile(contents: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'moi-app-config-'))
  const file = join(dir, 'config.json')
  await writeFile(file, contents)
  return file
}

test('defaults apply when no config file exists', () => {
  const config = loadAppConfig('/nonexistent/config.json', NO_ENV)
  expect(config).toEqual({
    cloudDemo: false,
    experiments: [],
    demoInstallUrl: 'https://moi.computer'
  })
})

test('config file values override defaults', async () => {
  const file = await configFile(
    JSON.stringify({
      cloudDemo: true,
      experiments: ['new-chat-ui'],
      demoInstallUrl: 'https://moi.computer/download'
    })
  )
  const config = loadAppConfig(file, NO_ENV)
  expect(config.cloudDemo).toBe(true)
  expect(config.experiments).toEqual(['new-chat-ui'])
  expect(config.demoInstallUrl).toBe('https://moi.computer/download')
})

test('env vars override the config file', async () => {
  const file = await configFile(JSON.stringify({ cloudDemo: true, experiments: ['from-file'] }))
  const config = loadAppConfig(file, {
    MOI_CLOUD_DEMO: '0',
    MOI_EXPERIMENTS: ' a, b ,,c '
  })
  expect(config.cloudDemo).toBe(false)
  expect(config.experiments).toEqual(['a', 'b', 'c'])
})

test('boolean env accepts 1/true/0/false and ignores anything else', () => {
  const on = (value: string) => loadAppConfig('/nonexistent', { MOI_CLOUD_DEMO: value }).cloudDemo
  expect(on('1')).toBe(true)
  expect(on('TRUE')).toBe(true)
  expect(on('0')).toBe(false)
  expect(on('maybe')).toBe(false) // unparseable → default
})

test('empty MOI_EXPERIMENTS clears file-set experiments', async () => {
  const file = await configFile(JSON.stringify({ experiments: ['from-file'] }))
  const config = loadAppConfig(file, { MOI_EXPERIMENTS: '' })
  expect(config.experiments).toEqual([])
})

test('invalid JSON falls back to defaults without throwing', async () => {
  const file = await configFile('{ not json')
  const config = loadAppConfig(file, NO_ENV)
  expect(config.cloudDemo).toBe(false)
})

test('wrong-typed keys are dropped individually, valid keys survive', async () => {
  const file = await configFile(
    JSON.stringify({ cloudDemo: 'yes', experiments: ['kept'], demoInstallUrl: 42 })
  )
  const config = loadAppConfig(file, NO_ENV)
  expect(config.cloudDemo).toBe(false)
  expect(config.experiments).toEqual(['kept'])
  expect(config.demoInstallUrl).toBe('https://moi.computer')
})

test('the resolved config is frozen', () => {
  const config = loadAppConfig('/nonexistent', NO_ENV)
  expect(Object.isFrozen(config)).toBe(true)
})
