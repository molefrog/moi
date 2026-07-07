// Single source of truth for the OS data dir holding moi's global state
// (workspaces.json, thread-config.json, workspace-env.json, …).
//
// MOI_DATA_DIR overrides it wholesale. This is the isolation seam for CLI
// e2e tests: env-paths only honors XDG_DATA_HOME on Linux, so on macOS a
// spawned CLI would otherwise read the developer's real data dir.
import envPaths from 'env-paths'

export const DATA_DIR = process.env.MOI_DATA_DIR || envPaths('moi', { suffix: false }).data
