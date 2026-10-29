import { packageManager } from '../../package.json'

// Use the same baseline as CI. packageManager documents the version, but
// `bun run dev` still executes whichever Bun is on PATH.
const requiredVersion = packageManager.slice('bun@'.length)

export function assertDevRuntime(version = Bun.version): void {
  if (Bun.semver.satisfies(version, `>=${requiredVersion}`)) return

  throw new Error(
    `Moi development requires Bun ${requiredVersion} or newer (running ${version}). ` +
      'Older dev bundlers can lose re-exported dependencies after edits ' +
      '("QueryClient is not a constructor"). ' +
      `Run \`bun upgrade --version ${requiredVersion}\`, then restart \`bun run dev\`.`
  )
}
