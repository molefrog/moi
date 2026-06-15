// Scaffolding for a workspace's `.moi/` root, laid down by `moi init` (and
// `moi openclaw init`). Creates `.moi/widgets/`, writes the widget
// dependency manifest, and installs dependencies — so the agent never has to
// bootstrap the folder itself.
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

// Dependency set available to widgets. `react`/`react-dom` are stubs — at
// runtime they resolve from esm.sh via the browser importmap; they're listed
// so editors pick up the correct types.
export const MOI_PACKAGE_JSON = {
  name: 'widgets',
  private: true,
  dependencies: {
    '@tabler/icons-react': '^3.40.0',
    tailwindcss: '^4.0.0',
    react: '^19.0.0',
    'react-dom': '^19.0.0'
  },
  devDependencies: {
    '@types/react': '^19.0.0',
    '@types/react-dom': '^19.0.0'
  }
} as const

// Bootstraps `.moi/` ONLY when it doesn't exist yet. Re-running `moi init`
// on an existing workspace overwrites skills but must leave the user's
// `.moi/` (their deps, widgets, lockfile) completely untouched.
// Returns 'exists' when skipped, otherwise the `bun install` exit code.
export async function scaffoldMoiDir(workspacePath: string): Promise<'exists' | number> {
  const moiDir = join(workspacePath, '.moi')
  if (await Bun.file(join(moiDir, 'package.json')).exists()) return 'exists'
  // A bare `.moi/` dir without package.json counts as not-bootstrapped —
  // fill in the missing pieces.

  await mkdir(join(moiDir, 'widgets'), { recursive: true })
  await Bun.write(join(moiDir, 'package.json'), JSON.stringify(MOI_PACKAGE_JSON, null, 2) + '\n')

  const install = Bun.spawn(['bun', 'install'], {
    cwd: moiDir,
    stdout: 'ignore',
    stderr: 'inherit'
  })
  return await install.exited
}
