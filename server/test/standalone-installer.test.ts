import { afterEach, describe, expect, test } from 'bun:test'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const INSTALLER = join(import.meta.dir, '..', '..', 'packaging', 'install.sh')
const VERSION = '0.4.0'

const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'moi-installer-test-'))
  tempRoots.push(root)
  return root
}

function writeExecutable(path: string, text: string): void {
  writeFileSync(path, text)
  chmodSync(path, 0o755)
}

async function fixture(root: string): Promise<{ tarball: string; checksum: string }> {
  const stage = join(root, 'payload')
  const runtime = join(stage, 'moi-runtime')
  mkdirSync(join(runtime, 'app', 'server'), { recursive: true })
  writeExecutable(
    join(runtime, 'bun'),
    [
      '#!/bin/sh',
      'if [ "$1" = "-e" ]; then exec "$MOCK_REAL_BUN" "$@"; fi',
      'printf \'%s\\n\' "$MOI_HOME" >"$MOCK_EXEC_HOME"',
      'printf \'%s\\n\' "$@" >"$MOCK_EXEC_ARGS"',
      ''
    ].join('\n')
  )
  writeFileSync(join(runtime, 'app', 'server', 'cli.ts'), '')
  writeFileSync(join(runtime, 'app', 'package.json'), JSON.stringify({ version: VERSION }) + '\n')

  const tarball = join(root, 'runtime.tar.gz')
  const tar = Bun.spawn(['tar', '-czf', tarball, '-C', stage, 'moi-runtime'], {
    env: { ...process.env, LC_ALL: 'C' },
    stderr: 'pipe'
  })
  expect(await tar.exited).toBe(0)

  const hasher = new Bun.CryptoHasher('sha256')
  hasher.update(await Bun.file(tarball).arrayBuffer())
  const checksum = join(root, 'runtime.tar.gz.sha256')
  writeFileSync(checksum, `${hasher.digest('hex')}  runtime.tar.gz\n`)
  return { tarball, checksum }
}

function mockCurl(bin: string): void {
  mkdirSync(bin, { recursive: true })
  writeExecutable(
    join(bin, 'curl'),
    [
      '#!/bin/sh',
      'out=""',
      'format=""',
      'url=""',
      'while [ "$#" -gt 0 ]; do',
      '  case "$1" in',
      '    -o) out="$2"; shift 2 ;;',
      '    -w) format="$2"; shift 2 ;;',
      '    *) url="$1"; shift ;;',
      '  esac',
      'done',
      'if [ -n "$format" ]; then',
      `  printf 'https://github.com/molefrog/moi/releases/tag/v${VERSION}'`,
      'elif [ "${url##*.}" = "sha256" ]; then',
      '  [ "${MOCK_NO_CHECKSUM:-}" = "1" ] && exit 22',
      '  cp "$MOCK_CHECKSUM" "$out"',
      'else',
      '  cp "$MOCK_TARBALL" "$out"',
      'fi',
      ''
    ].join('\n')
  )
}

async function runInstaller(
  root: string,
  home: string,
  options: { noChecksum?: boolean } = {}
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const files = await fixture(root)
  const bin = join(root, 'bin')
  mockCurl(bin)
  const proc = Bun.spawn(['sh', INSTALLER], {
    env: {
      ...process.env,
      HOME: join(root, 'user-home'),
      MOI_HOME: home,
      MOI_NO_MODIFY_PATH: '1',
      MOCK_TARBALL: files.tarball,
      MOCK_CHECKSUM: files.checksum,
      MOCK_REAL_BUN: process.execPath,
      MOCK_NO_CHECKSUM: options.noChecksum ? '1' : '',
      LC_ALL: 'C',
      PATH: `${bin}:${process.env.PATH ?? ''}`
    },
    stdout: 'pipe',
    stderr: 'pipe'
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text()
  ])
  return { exitCode, stdout, stderr }
}

describe('standalone shell installer', () => {
  test('installs atomically, prunes old versions, and preserves an exotic MOI_HOME', async () => {
    const root = tempRoot()
    const home = join(root, "custom home a'b$HOME")
    const runtime = join(home, 'runtime')
    mkdirSync(join(runtime, '0.1.0'), { recursive: true })
    mkdirSync(join(runtime, '0.2.0'))
    symlinkSync('0.2.0', join(runtime, 'current'))

    const result = await runInstaller(root, home)
    expect(result.exitCode, result.stderr).toBe(0)
    expect(readlinkSync(join(runtime, 'current'))).toBe(VERSION)
    expect(existsSync(join(runtime, VERSION))).toBe(true)
    expect(existsSync(join(runtime, '0.2.0'))).toBe(true)
    expect(existsSync(join(runtime, '0.1.0'))).toBe(false)
    expect(existsSync(join(runtime, '.install-lock'))).toBe(false)

    const execHome = join(root, 'exec-home.txt')
    const execArgs = join(root, 'exec-args.txt')
    const shimEnv: Record<string, string | undefined> = {
      ...process.env,
      MOCK_EXEC_HOME: execHome,
      MOCK_EXEC_ARGS: execArgs
    }
    delete shimEnv.MOI_HOME
    const shim = Bun.spawn([join(home, 'bin', 'moi'), 'version'], { env: shimEnv })
    expect(await shim.exited).toBe(0)
    expect(readFileSync(execHome, 'utf8').trim()).toBe(home)
    expect(readFileSync(execArgs, 'utf8').trim().split('\n')).toEqual([
      join(home, 'runtime', 'current', 'app', 'server', 'cli.ts'),
      'version'
    ])
  })

  test('fails closed before mutating the install when the checksum is absent', async () => {
    const root = tempRoot()
    const home = join(root, 'standalone-home')

    const result = await runInstaller(root, home, { noChecksum: true })
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr).toContain('has no checksum')
    expect(existsSync(home)).toBe(false)
  })

  test('does not replace a newer installed runtime', async () => {
    const root = tempRoot()
    const home = join(root, 'standalone-home')
    const runtime = join(home, 'runtime')
    mkdirSync(join(runtime, '0.5.0'), { recursive: true })
    symlinkSync('0.5.0', join(runtime, 'current'))

    const result = await runInstaller(root, home)
    expect(result.exitCode).toBe(0)
    expect(readlinkSync(join(runtime, 'current'))).toBe('0.5.0')
    expect(result.stdout).toContain('Keeping installed moi 0.5.0')
  })

  test('refuses to install into the user home directory', async () => {
    const root = tempRoot()
    const home = join(root, 'user-home')

    const result = await runInstaller(root, home)
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr).toContain('must not be your home directory')
    expect(existsSync(home)).toBe(false)
  })
})
