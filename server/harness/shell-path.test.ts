import { expect, spyOn, test } from 'bun:test'

import { cachedLoginShellPath, loginShellPath } from './shell-path'

test('refreshes a cached login-shell PATH and joins concurrent refreshes', async () => {
  await loginShellPath()
  const spawn = Bun.spawn.bind(Bun)
  let path = '/first/bin'
  const spawnSpy = spyOn(Bun, 'spawn').mockImplementation(() =>
    spawn(['sh', '-c', `printf '__moi_env__PATH=${path}\\n__moi_env__'`], {
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'ignore'
    })
  )
  try {
    expect(await loginShellPath({ refresh: true })).toBe('/first/bin')
    path = '/new/bin'
    expect(await loginShellPath()).toBe('/first/bin')
    expect(
      await Promise.all([loginShellPath({ refresh: true }), loginShellPath({ refresh: true })])
    ).toEqual(['/new/bin', '/new/bin'])
    expect(cachedLoginShellPath()).toBe('/new/bin')
    expect(spawnSpy).toHaveBeenCalledTimes(2)

    path = ''
    expect(await loginShellPath({ refresh: true })).toBeUndefined()
    expect(await loginShellPath()).toBeUndefined()
    expect(await loginShellPath()).toBeUndefined()
    expect(cachedLoginShellPath()).toBeUndefined()
    expect(spawnSpy).toHaveBeenCalledTimes(3)

    path = '/recovered/bin'
    expect(await loginShellPath({ refresh: true })).toBe('/recovered/bin')
    expect(spawnSpy).toHaveBeenCalledTimes(4)
  } finally {
    spawnSpy.mockRestore()
    await loginShellPath({ refresh: true })
  }
})
