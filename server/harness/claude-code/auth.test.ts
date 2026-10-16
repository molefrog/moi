import { expect, test, spyOn } from 'bun:test'

import type { HarnessAvailability } from '@/lib/types'

import { mkdtemp, chmod, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as executable from '../executable'
import * as config from '../../app-config'
import * as browser from '../../open-browser'

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

test('Claude login waits for the browser capture after printing its URL and accepts only its full code', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'moi-auth-cli-'))
  const path = join(dir, 'claude')
  const find = spyOn(executable, 'findHarnessExecutable').mockReturnValue(path)
  const appConfig = config.getAppConfig()
  const cfg = spyOn(config, 'getAppConfig')
  const open = spyOn(browser, 'openBrowser').mockResolvedValue()
  try {
    for (const environment of ['local', 'cloud'] as const) {
      cfg.mockReturnValue({ ...appConfig, environment })
      await Bun.write(
        path,
        `#!/bin/sh
printf 'Visit: https://claude.com/oauth/authorize?response_type=code&state=test-state\\n'
${environment === 'cloud' ? '[ "$BROWSER" = true ] || exit 2' : 'sleep 0.2; "$BROWSER" "https://claude.com/oauth/authorize?response_type=code&state=test-state&redirect_uri=http%3A%2F%2Flocalhost%3A1234%2Fcallback"'}
read code
[ "$code" = 'test-code#test-state' ] || exit 1
`
      )
      await chmod(path, 0o755)
      const login = await startClaudeLogin()
      expect(login.acceptsCode).toBe(true)
      expect(login.codeUrl).toBe(
        'https://claude.com/oauth/authorize?response_type=code&state=test-state'
      )
      if (environment === 'local') {
        expect(new URL(login.url).searchParams.get('redirect_uri')).toBe(
          'http://localhost:1234/callback'
        )
        expect(open).toHaveBeenCalledWith(login.url)
      } else {
        expect(login.url).toBe(
          'https://claude.com/oauth/authorize?response_type=code&state=test-state'
        )
      }
      expect(login.id).toBeDefined()
      await expect(login.submitCode?.('wrong-state#old')).rejects.toThrow('full code')
      await login.submitCode?.('test-code#test-state')
      await login.completed
    }
  } finally {
    find.mockRestore()
    cfg.mockRestore()
    open.mockRestore()
    await rm(dir, { recursive: true, force: true })
  }
})
