// Scaffolding for a workspace's `.moi/` root, laid down by `moi init` (and
// `moi openclaw init`). Creates `.moi/widgets/`, writes the widget
// dependency manifest, and installs dependencies — so the agent never has to
// bootstrap the folder itself.
import { mkdir, stat } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'

import { syncAppletDeclarations } from './applets/declarations'

// Dependency set available to widgets. `react`/`react-dom` are stubs — at
// runtime they resolve to moi's locally-vendored ESM via the browser importmap
// (/vendor/react); they're listed so editors pick up the correct types.
export const MOI_PACKAGE_JSON = {
  name: 'widgets',
  private: true,
  dependencies: {
    '@tabler/icons-react': '^3.40.0',
    tailwindcss: '^4.3.3',
    react: '^19.0.0',
    'react-dom': '^19.0.0',
    // The `moi ui-components` baseline: every installed component leans on
    // Base UI primitives and the cn() stack, so one install at workspace
    // creation covers the common path. Component-specific deps (recharts,
    // embla, …) stay agent-installed on demand — `add` prints them.
    '@base-ui/react': '^1.8.0',
    'class-variance-authority': '^0.7.1',
    clsx: '^2.1.1',
    'tailwind-merge': '^3.3.1'
  },
  devDependencies: {
    '@types/react': '^19.0.0',
    '@types/react-dom': '^19.0.0'
  }
} as const

// Dependency installation is helpful for editor types and widget builds, but
// it's not critical — the agent installs on demand if it's missing. So it must
// never block workspace creation: we wait briefly, then let it finish in the
// background, with a hard kill as a backstop against a hung registry.
const INSTALL_WAIT_MS = 10_000
const INSTALL_TIMEOUT_MS = 120_000

type InstallDependencies = (moiDir: string) => Promise<number>

async function runBunInstall(moiDir: string): Promise<number> {
  const install = Bun.spawn(['bun', 'install'], {
    cwd: moiDir,
    stdout: 'ignore',
    stderr: 'inherit',
    timeout: INSTALL_TIMEOUT_MS,
    killSignal: 'SIGKILL'
  })
  // Don't hold the event loop open for a backgrounded install: a short-lived
  // CLI (`moi init`) must exit after the wait, not linger until the child
  // does. The child survives parent exit and finishes the install on its own
  // (verified: orphaned bun processes complete; only the 2-minute kill is no
  // longer enforced once the parent is gone).
  install.unref()
  return install.exited
}

// Keep machine-local state out of workspaces that are git repos: build output,
// derived caches (applet thumbnails), and installed dependencies are all
// re-creatable and would otherwise churn or bloat the repo. The applet sources,
// package.json, and lockfile stay committable — they ARE the workspace.
const REQUIRED_IGNORES = ['.build/', '.cache/', 'node_modules/'] as const

export const MOI_GITIGNORE = `# moi internals — machine-local, re-creatable state
${REQUIRED_IGNORES.join('\n')}
`

// Create `.moi/.gitignore` when missing, or append required entries a
// pre-gitignore or hand-edited file lacks. Never rewrites existing content —
// user additions survive. Safe to call often; no-ops once the file is right.
export async function ensureMoiGitignore(workspacePath: string): Promise<void> {
  const moiDir = join(workspacePath, '.moi')
  if (!(await isDirectory(moiDir))) return
  const path = join(moiDir, '.gitignore')
  const file = Bun.file(path)
  if (!(await file.exists())) {
    await Bun.write(path, MOI_GITIGNORE)
    return
  }
  const text = await file.text()
  // Match entries with or without the trailing slash or a leading slash.
  const present = new Set(text.split('\n').map(line => line.trim().replace(/^\/|\/$/g, '')))
  const missing = REQUIRED_IGNORES.filter(entry => !present.has(entry.replace(/\/$/, '')))
  if (missing.length === 0) return
  await Bun.write(path, `${text.replace(/\n*$/, '\n')}${missing.join('\n')}\n`)
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

// Bootstraps `.moi/` ONLY when it doesn't exist yet. Re-running `moi init`
// on an existing workspace overwrites skills but must leave the user's
// `.moi/` (their deps, widgets, lockfile) completely untouched.
// Returns 'exists' when skipped, 'installing' when `bun install` outlived the
// wait and continues in the background, otherwise the install exit code.
export async function scaffoldMoiDir(
  workspacePath: string,
  installDependencies: InstallDependencies = runBunInstall,
  installWaitMs: number = INSTALL_WAIT_MS
): Promise<'exists' | 'installing' | number> {
  // Backstop against the nested-workspace bug: never scaffold a `.moi/` *inside*
  // another workspace's `.moi/` (which produces the junk `.moi/.moi`). Callers
  // (`moi init`) lift to the workspace root via `liftToWorkspaceRoot` first, so
  // this only fires on a programmer error.
  if (resolve(workspacePath).split(sep).includes('.moi')) {
    throw new Error(
      `Refusing to scaffold a workspace inside a .moi directory: ${workspacePath}. ` +
        'Run from the workspace root.'
    )
  }
  const moiDir = join(workspacePath, '.moi')
  const packagePath = join(moiDir, 'package.json')
  if (await Bun.file(packagePath).exists()) {
    // Repair path: workspaces scaffolded before `.moi/.gitignore` existed pick
    // it up on the next `moi init` instead of leaking cache files into git.
    await ensureMoiGitignore(workspacePath)
    return 'exists'
  }
  // A bare `.moi/` dir without package.json counts as not-bootstrapped —
  // fill in the missing pieces.

  await mkdir(join(moiDir, 'widgets'), { recursive: true })
  await Bun.write(packagePath, JSON.stringify(MOI_PACKAGE_JSON, null, 2) + '\n')
  await ensureMoiGitignore(workspacePath)
  await syncAppletDeclarations(workspacePath)

  const exited = installDependencies(moiDir)
  let timer: ReturnType<typeof setTimeout> | undefined
  const result = await Promise.race([
    exited,
    new Promise<'installing'>(r => (timer = setTimeout(() => r('installing'), installWaitMs)))
  ])
  clearTimeout(timer)

  if (result === 'installing') {
    console.log(`[scaffold] bun install in ${moiDir} still running — continuing in the background`)
    exited.then(code => {
      if (code === 0) console.log(`[scaffold] background bun install in ${moiDir} finished`)
      else
        console.warn(
          `[scaffold] background bun install in ${moiDir} failed (exit ${code}) — the agent will install deps on demand`
        )
    })
  }
  return result
}
