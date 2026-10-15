// Single source of truth for the OS data dir holding moi's global state
// (workspaces.json, settings.json, session-config.json, selected-sessions.json, …).
//
// MOI_DATA_DIR overrides it wholesale. This is the isolation seam for CLI
// e2e tests: env-paths only honors XDG_DATA_HOME on Linux, so on macOS a
// spawned CLI would otherwise read the developer's real data dir.
import envPaths from 'env-paths'
import { accessSync, constants } from 'node:fs'

export const DATA_DIR = process.env.MOI_DATA_DIR || envPaths('moi', { suffix: '' }).data

// Can this process open moi's data folder? Not when it's the agent's own OS
// user on a managed machine (docs/config.md): such callers go through
// the running server instead. A folder that doesn't exist yet counts as usable.
export function canUseDataDir(): boolean {
  try {
    accessSync(DATA_DIR, constants.R_OK | constants.W_OK | constants.X_OK)
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'ENOENT'
  }
}
