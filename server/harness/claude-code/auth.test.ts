import { expect, test, spyOn } from 'bun:test'

import type { HarnessAvailability } from '@/lib/types'

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as executable from '../executable'
import * as config from '../../app-config'
import * as browser from '../../open-browser'
import * as launcher from '../../agent-launcher'

import { claudeAuthReadiness, claudeLoginUrl, startClaudeLogin } from './auth'

const unavailable: HarnessAvailability = {
  status: 'unavailable',
  reason: 'Could not check the Claude login status'
}

test('accepts the documented logged-in exit code', () => {
  expect(claudeAuthReadiness({ exitCode: 0, timedOut: false })).toEqual({
    status: 'available'
  })
})

test('requires login only for the documented signed-out exit code', () => {
  expect(claudeAuthReadiness({ exitCode: 1, timedOut: false })).toEqual({
    status: 'login-required',
    reason: 'Claude is signed out. Sign in to send messages'
  })
})

test('reports a timed-out Claude auth probe as unavailable', () => {
  expect(claudeAuthReadiness({ exitCode: 1, timedOut: true })).toEqual(unavailable)
})

test('reports an abnormal Claude auth exit as unavailable', () => {
  expect(claudeAuthReadiness({ exitCode: 2, timedOut: false })).toEqual(unavailable)
})

test('reads the manual URL from CLI output, including terminal hyperlinks', () => {
  const url = 'https://claude.com/oauth/authorize?response_type=code&state=test'
  expect(claudeLoginUrl(`Visit: \x1b]8;;${url}\x07${url}\x1b]8;;\x07\n`)).toBe(url)
  expect(claudeLoginUrl('Visit: https://claude.com/oauth')).toBeUndefined()
})

test('Claude login captures the local callback URL and preserves the cloud code flow', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'moi-auth-cli-'))
  const path = join(dir, 'fake claude.ts')
  const find = spyOn(executable, 'findHarnessExecutable').mockReturnValue(process.execPath)
  const command = spyOn(launcher, 'agentCommand').mockReturnValue([process.execPath, path])
  const appConfig = config.getAppConfig()
  const cfg = spyOn(config, 'getAppConfig')
  const open = spyOn(browser, 'openBrowser').mockResolvedValue()
  const manualUrl = 'https://claude.com/oauth/authorize?response_type=code&state=test-state'
  // Preserve encoded characters, ampersands, and exclamation marks through the helper.
  const callbackUrl = `${manualUrl}&redirect_uri=http%3A%2F%2Flocalhost%3A1234%2Fcallback&test=a!b%20c`
  try {
    await Bun.write(
      path,
      `
console.log(${JSON.stringify(manualUrl)})
if (process.env.BROWSER !== 'true') {
  await Bun.sleep(200)
  const url = ${JSON.stringify(callbackUrl)}
  const browser = process.env.BROWSER!
  const args = process.platform === 'win32'
    ? ['cmd.exe', '/d', '/s', '/c', '""' + browser + '" "%MOI_TEST_CALLBACK_URL%""']
    : [browser, url]
  const proc = Bun.spawn(args, {
    env: { ...process.env, MOI_TEST_CALLBACK_URL: url },
    windowsVerbatimArguments: process.platform === 'win32',
    stdout: 'ignore', stderr: 'inherit'
  })
  if (await proc.exited !== 0) process.exit(2)
  if (process.argv[2] === 'automatic') {
    await Bun.sleep(200)
    process.exit(0)
  }
}
let code = ''
for await (const chunk of Bun.stdin.stream()) {
  code += new TextDecoder().decode(chunk)
  if (code.includes('\\n')) break
}
process.exit(code.trim() === 'test-code#test-state' ? 0 : 1)
`
    )
    for (const flow of ['local', 'cloud', 'automatic'] as const) {
      const environment = flow === 'cloud' ? 'cloud' : 'local'
      command.mockReturnValue([process.execPath, path, flow])
      cfg.mockReturnValue({ ...appConfig, environment })
      open.mockClear()
      const login = await startClaudeLogin()
      try {
        expect(login.codeUrl).toBe(manualUrl)
        if (environment === 'local') {
          expect(login.url).toBe(callbackUrl)
          expect(open).toHaveBeenCalledTimes(1)
          expect(open).toHaveBeenCalledWith(callbackUrl)
        } else {
          expect(login.url).toBe(manualUrl)
          expect(open).not.toHaveBeenCalled()
        }
        expect(login.id).toBeDefined()
        if (flow !== 'automatic') {
          await expect(login.submitCode?.('wrong-state#old')).rejects.toThrow('full code')
          await login.submitCode?.('test-code#test-state')
        }
        await login.completed
      } finally {
        await login.cancel?.()
      }
    }
  } finally {
    find.mockRestore()
    command.mockRestore()
    cfg.mockRestore()
    open.mockRestore()
    await rm(dir, { recursive: true, force: true })
  }
})
