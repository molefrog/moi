import { afterAll, afterEach, expect, spyOn, test } from 'bun:test'
import * as config from '../app-config'
import * as executable from './executable'
import { installHarness } from './install'

const originalConfig = config.getAppConfig()
const configSpy = spyOn(config, 'getAppConfig')
const detect = spyOn(executable, 'detectInstalledHarnesses')
const spawn = spyOn(Bun, 'spawn')
const installed = { 'claude-code': false, codex: false, openclaw: false, hermes: false }

afterAll(() => {
  configSpy.mockRestore()
  detect.mockRestore()
  spawn.mockRestore()
})

afterEach(() => {
  configSpy.mockReset()
  detect.mockReset()
  spawn.mockReset()
})

function local() {
  configSpy.mockReturnValue({
    ...originalConfig,
    environment: 'local',
    demo: false,
    agentLauncher: null
  })
}

test('blocks cloud, demo, managed agents, and unsupported harnesses before spawning', () => {
  for (const override of [
    { environment: 'cloud' as const },
    { demo: true },
    { agentLauncher: '/launcher' }
  ]) {
    local()
    configSpy.mockReturnValue({ ...config.getAppConfig(), ...override })
    expect(() => installHarness('codex')).toThrow('local Moi')
  }
  local()
  expect(() => installHarness('hermes')).toThrow('manual installation')
  expect(spawn).not.toHaveBeenCalled()
})

test('skips an installed agent', async () => {
  local()
  detect.mockResolvedValue({ ...installed, codex: true })
  await installHarness('codex')
  expect(spawn).not.toHaveBeenCalled()
})

test('concurrent requests share installation and check the installed executable', async () => {
  local()
  detect.mockResolvedValueOnce(installed).mockResolvedValue({ ...installed, codex: true })
  // Only the exit promise is consumed; no installer runs in tests.
  spawn.mockReturnValue({ exited: Promise.resolve(0) } as ReturnType<typeof Bun.spawn>)
  const first = installHarness('codex')
  expect(installHarness('codex')).toBe(first)
  await first
  expect(spawn).toHaveBeenCalledTimes(1)
  expect(detect).toHaveBeenCalledTimes(2)
})

test('failed installs can be retried and missing executables are reported', async () => {
  local()
  detect.mockResolvedValue(installed)
  spawn.mockReturnValue({ exited: Promise.resolve(1) } as ReturnType<typeof Bun.spawn>)
  await expect(installHarness('claude-code')).rejects.toThrow('failed or timed out')
  spawn.mockReturnValue({ exited: Promise.resolve(0) } as ReturnType<typeof Bun.spawn>)
  await expect(installHarness('claude-code')).rejects.toThrow('could not be found')
  detect.mockResolvedValueOnce(installed).mockResolvedValue({ ...installed, 'claude-code': true })
  await installHarness('claude-code')
  expect(spawn).toHaveBeenCalledTimes(3)
})
