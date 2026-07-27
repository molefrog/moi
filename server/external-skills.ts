import type { WorkspaceType } from '@/lib/types'

export const SHADCN_SKILL_INSTALL_TIMEOUT_MS = 30_000

const SKILL_INSTALL_ENV_KEYS = [
  'PATH',
  'HOME',
  'USERPROFILE',
  'SYSTEMROOT',
  'TMPDIR',
  'TEMP',
  'TMP',
  'XDG_CACHE_HOME',
  'BUN_INSTALL',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'NODE_EXTRA_CA_CERTS',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR'
] as const

function skillInstallEnv(source: NodeJS.ProcessEnv): Record<string, string> {
  const env: Record<string, string> = {
    DISABLE_TELEMETRY: '1',
    NO_COLOR: '1'
  }
  for (const key of SKILL_INSTALL_ENV_KEYS) {
    const value = source[key]
    if (value) env[key] = value
  }
  return env
}

export type ShadcnSkillInstallSpec = {
  command: string[]
  cwd: string
  env: Record<string, string>
  timeout: number
  killSignal: 'SIGKILL'
}

export function shadcnSkillInstallSpec(
  workspaceRoot: string,
  type: WorkspaceType = 'claude-code',
  sourceEnv: NodeJS.ProcessEnv = process.env
): ShadcnSkillInstallSpec {
  return {
    command: [
      'bunx',
      '--bun',
      'skills',
      'add',
      'shadcn/ui',
      '--skill',
      'shadcn',
      '--agent',
      type,
      '--yes'
    ],
    cwd: workspaceRoot,
    env: skillInstallEnv(sourceEnv),
    timeout: SHADCN_SKILL_INSTALL_TIMEOUT_MS,
    killSignal: 'SIGKILL'
  }
}

export type RunShadcnSkillInstall = (workspaceRoot: string, type: WorkspaceType) => Promise<number>

async function runShadcnSkillInstall(workspaceRoot: string, type: WorkspaceType): Promise<number> {
  const spec = shadcnSkillInstallSpec(workspaceRoot, type)
  const install = Bun.spawn(spec.command, {
    cwd: spec.cwd,
    env: spec.env,
    stdout: 'ignore',
    stderr: 'inherit',
    timeout: spec.timeout,
    killSignal: spec.killSignal
  })
  return install.exited
}

export type ShadcnSkillInstallResult =
  | { ok: true }
  | {
      ok: false
      reason: string
    }

// Fetch the current official shadcn skill into the active agent's standard
// project skill directory. Callers decide whether a failure is fatal: workspace
// initialization warns and continues, while a manual skill update fails.
export async function installOfficialShadcnSkill(
  workspaceRoot: string,
  type: WorkspaceType = 'claude-code',
  runInstall: RunShadcnSkillInstall = runShadcnSkillInstall
): Promise<ShadcnSkillInstallResult> {
  try {
    const code = await runInstall(workspaceRoot, type)
    if (code === 0) return { ok: true }
    return { ok: false, reason: `installer exited with code ${code}` }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, reason: message }
  }
}
