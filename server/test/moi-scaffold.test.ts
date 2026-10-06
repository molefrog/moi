import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'path'

import { syncAppletDeclarations } from '../applets/declarations'
import { ensureMoiGitignore, scaffoldMoiDir } from '../moi-scaffold'
import { silenceConsole } from './quiet'

// The scaffold backstop: `scaffoldMoiDir` must refuse to create a `.moi/` inside
// another `.moi/` (the nested-workspace bug). The guard runs before any fs work,
// so these tests never touch the network (`bun install`).

let WS: string
beforeEach(() => {
  WS = mkdtempSync(join(import.meta.dir, 'moi-scaffold-test-'))
})
afterEach(() => {
  rmSync(WS, { recursive: true, force: true })
})

describe('scaffoldMoiDir guard', () => {
  test('refuses to scaffold inside a .moi directory (any nesting depth)', async () => {
    // The guard keys on the exact `.moi` path segment and runs before any fs
    // work, so nothing is created. (The "merely prefixed" case — `.moimoi` is a
    // normal name — is covered by liftToWorkspaceRoot's segment-exact tests.)
    await expect(scaffoldMoiDir(join(WS, '.moi'))).rejects.toThrow(/inside a \.moi/)
    await expect(scaffoldMoiDir(join(WS, '.moi', 'widgets'))).rejects.toThrow(/inside a \.moi/)
    await expect(scaffoldMoiDir(join(WS, '.moi', '.moi'))).rejects.toThrow(/inside a \.moi/)
    expect(existsSync(join(WS, '.moi'))).toBe(false)
  })
})

describe('scaffoldMoiDir install', () => {
  // The overrunning install reports itself as it backgrounds and as it finishes.
  silenceConsole('log')

  test('returns the exit code when the install finishes within the wait', async () => {
    const moiDir = join(WS, '.moi')

    const result = await scaffoldMoiDir(WS, async cwd => {
      expect(cwd).toBe(moiDir)
      return 137
    })

    expect(result).toBe(137)
    expect(existsSync(join(moiDir, 'package.json'))).toBe(true)
    expect(existsSync(join(moiDir, 'widgets'))).toBe(true)
    expect(await Bun.file(join(moiDir, 'base.d.ts')).text()).toContain('icon?: string')
    // Machine-local state must never end up committed in a workspace repo.
    const gitignore = await Bun.file(join(moiDir, '.gitignore')).text()
    for (const entry of ['.build/', '.cache/', 'node_modules/']) {
      expect(gitignore).toContain(entry)
    }
  })

  test('returns "installing" when the install outlives the wait', async () => {
    let finish!: (code: number) => void
    const exited = new Promise<number>(r => (finish = r))

    const result = await scaffoldMoiDir(WS, () => exited, 10)

    expect(result).toBe('installing')
    finish(0)
    expect(await exited).toBe(0)
  })

  test('leaves an existing manifest untouched and skips the install', async () => {
    const moiDir = join(WS, '.moi')
    mkdirSync(moiDir, { recursive: true })
    writeFileSync(join(moiDir, 'package.json'), JSON.stringify({ private: true }))
    let installs = 0

    const result = await scaffoldMoiDir(WS, async () => {
      installs++
      return 0
    })

    expect(result).toBe('exists')
    expect(installs).toBe(0)
    // The repair path: pre-gitignore workspaces pick the file up on re-init.
    expect(existsSync(join(moiDir, '.gitignore'))).toBe(true)
  })
})

describe('dependency install diagnostics', () => {
  function writeInstaller(script: string): string {
    const binDir = join(WS, 'bin')
    mkdirSync(binDir)
    const executable = join(binDir, 'bun')
    writeFileSync(executable, '#!/bin/sh\n' + script)
    chmodSync(executable, 0o755)
    return binDir
  }

  test('a failed install reports its log and captures both streams', async () => {
    const binDir = writeInstaller('echo "install stdout"\necho "install stderr" >&2\nexit 23\n')
    const proc = Bun.spawn(
      [process.execPath, join(import.meta.dir, '..', 'cli.ts'), 'init', WS, '--harness=codex'],
      {
        env: {
          ...process.env,
          PATH: binDir,
          MOI_DATA_DIR: join(WS, 'moi-data'),
          MOI_CONTROL_PORT: '65534'
        },
        stdout: 'ignore',
        stderr: 'pipe',
        timeout: 3000
      }
    )
    await proc.exited
    const stderr = await new Response(proc.stderr).text()
    const logPath = stderr.match(/Install log: (.+)/)?.[1]

    expect(stderr).toContain('bun install failed (exit 23)')
    expect(logPath).toBeDefined()
    if (!logPath) throw new Error('Missing install log path')
    try {
      expect(dirname(logPath)).toBe(tmpdir())
      const log = await Bun.file(logPath).text()
      expect(log).toContain('install stdout')
      expect(log).toContain('install stderr')
    } finally {
      rmSync(logPath)
    }
  })

  test('captures background output after the parent process exits', async () => {
    const releasePath = join(WS, 'release-install')
    const logPath = join(WS, 'background-install.log')
    const binDir = writeInstaller(`
      while [ ! -f "$MOI_TEST_INSTALL_RELEASE" ]; do /bin/sleep 0.01; done
      echo "error after parent exit" >&2
    `)
    const source = join(import.meta.dir, '..', 'moi-scaffold.ts')
    const proc = Bun.spawn(
      [
        process.execPath,
        '-e',
        `import { scaffoldMoiDir } from ${JSON.stringify(source)};
         await scaffoldMoiDir(${JSON.stringify(WS)}, undefined, 5, ${JSON.stringify(logPath)});`
      ],
      {
        env: { ...process.env, PATH: binDir, MOI_TEST_INSTALL_RELEASE: releasePath },
        stdout: 'ignore',
        stderr: 'ignore',
        timeout: 2000
      }
    )
    try {
      expect(await proc.exited).toBe(0)
      writeFileSync(releasePath, '')
      const log = Bun.file(logPath)
      for (let attempts = 0; attempts < 100; attempts++) {
        if ((await log.text()).includes('error after parent exit')) break
        await Bun.sleep(10)
      }
      expect(await log.text()).toContain('error after parent exit')
    } finally {
      writeFileSync(releasePath, '')
    }
  })
})

describe('ensureMoiGitignore', () => {
  test('appends missing entries without touching user content', async () => {
    const moiDir = join(WS, '.moi')
    mkdirSync(moiDir, { recursive: true })
    writeFileSync(join(moiDir, '.gitignore'), '# mine\nsecrets.txt\n.build/\n')

    await ensureMoiGitignore(WS)

    const text = await Bun.file(join(moiDir, '.gitignore')).text()
    expect(text).toContain('# mine\nsecrets.txt\n.build/\n')
    expect(text).toContain('.cache/')
    expect(text).toContain('node_modules/')

    // A complete file is left byte-identical.
    await ensureMoiGitignore(WS)
    expect(await Bun.file(join(moiDir, '.gitignore')).text()).toBe(text)
  })

  test('does nothing when the workspace has no .moi directory', async () => {
    await ensureMoiGitignore(WS)
    expect(existsSync(join(WS, '.moi'))).toBe(false)
  })
})

describe('syncAppletDeclarations', () => {
  test('leaves a current ambient type file untouched', async () => {
    mkdirSync(join(WS, '.moi'), { recursive: true })
    expect(await syncAppletDeclarations(WS)).toEqual(['base.d.ts'])
    const path = join(WS, '.moi', 'base.d.ts')
    const fixedTime = new Date('2000-01-01T00:00:00.000Z')
    utimesSync(path, fixedTime, fixedTime)
    const before = statSync(path).mtimeMs

    expect(await syncAppletDeclarations(WS)).toEqual([])
    expect(statSync(path).mtimeMs).toBe(before)
  })
})
