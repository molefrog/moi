import type { HarnessAvailability } from '@/lib/types'

export const FX_MIN_SUPPORTED_VERSION = '0.0.9'

type FxVersionOptions = {
  cwd?: string
  env?: Record<string, string | undefined>
  timeoutMs?: number
}

const versionCheckFailed: HarnessAvailability = {
  status: 'unavailable',
  reason: 'Could not check the fx version. Run fx --version in your terminal and reopen this chat.'
}

export function fxVersionAvailability(output: string): HarnessAvailability {
  const version = output.trim()
  // The CLI prints a bare semantic version. Reject ambiguous or unrecognized output.
  const parsed = version.match(
    /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/
  )
  if (!parsed || parsed[1]?.split('.').some(part => /^0\d+$/.test(part))) {
    return versionCheckFailed
  }
  try {
    if (Bun.semver.order(version, FX_MIN_SUPPORTED_VERSION) >= 0) {
      return { status: 'available' }
    }
  } catch {
    return versionCheckFailed
  }
  return {
    status: 'unavailable',
    reason: `moi requires fx ${FX_MIN_SUPPORTED_VERSION} or later. Found fx ${version}. Run fx upgrade.`
  }
}

export async function checkFxVersion(
  command: string,
  options: FxVersionOptions = {}
): Promise<HarnessAvailability> {
  try {
    const proc = Bun.spawn([command, '--version'], {
      cwd: options.cwd,
      env: { ...process.env, ...options.env, FX_AUTO_UPGRADE: '0' },
      stdout: 'pipe',
      stderr: 'ignore'
    })
    const timeout = setTimeout(() => proc.kill('SIGKILL'), options.timeoutMs ?? 5_000)
    try {
      const [output, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited])
      return code === 0 ? fxVersionAvailability(output) : versionCheckFailed
    } finally {
      clearTimeout(timeout)
    }
  } catch {
    return versionCheckFailed
  }
}
