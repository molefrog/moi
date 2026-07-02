import { existsSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'path'

// Where the moi server child process should run.
//
// It only needs to sit in the package root when the DEV BUNDLER will run at
// boot: Bun reads bunfig.toml and its cwd-relative `[serve.static]` plugins
// (`./client/externalize-react.ts`) before any JS runs, so the cwd must be the
// package root then — and process.chdir() is too late.
//
// A PREBUILT install (dist/index.html present, no --dev) serves static files
// and never reads the bunfig, so it runs from a neutral, stable dir instead.
// Otherwise the server sits inside the very directory `bun i -g` replaces on
// upgrade, dangling its own cwd inode and breaking every later widget build
// with "CurrentWorkingDirectoryUnlinked Error creating transpiler". The child
// finds its own code via import.meta.filename (absolute), so a neutral cwd
// costs nothing.
export function serverCwd(projectRoot: string, dev: boolean): string {
  const usesDevBundler = dev || !existsSync(join(projectRoot, 'dist', 'index.html'))
  if (usesDevBundler) return projectRoot
  return homedir() || tmpdir() || projectRoot
}
