#!/usr/bin/env bun
// Plain ESM launcher so Node can parse far enough to print a friendly error.
// The real CLI (server/cli.ts) is TypeScript, uses Bun-only APIs, and relies
// on the `@/` path alias — none of which Node can load. So it MUST be a
// dynamic import placed AFTER the Bun guard below: a static import would be
// hoisted and fail before the guard ever runs.
if (!process.versions.bun) {
  console.error('moi requires Bun (Node is not supported).')
  console.error('Install Bun:  curl -fsSL https://bun.sh/install | bash')
  console.error('Then run:     bun i -g moi-computer')
  process.exit(1)
}

// The widget bundler needs Bun 1.3: it hands `Bun.build` a virtual entrypoint
// that only 1.3+ lets a plugin resolve. Older Bun starts fine and then fails on
// the first widget build, so reject it here where the cause is still legible.
// `?.` because a Bun without `Bun.semver` is old enough to reject anyway.
// Compare the release version alone: semver ranges exclude prereleases, so a
// `1.4.0-canary.1` would be rejected for being newer.
const MIN_BUN = '1.3.0'
if (!Bun.semver?.satisfies(Bun.version.split(/[-+]/)[0], `>=${MIN_BUN}`)) {
  console.error(`moi requires Bun ${MIN_BUN} or newer (this is Bun ${Bun.version}).`)
  console.error('Upgrade Bun:  bun upgrade')
  process.exit(1)
}

// The `moi` command is meant to live on your PATH permanently: the agent
// shells out to `moi bundle`/`moi refresh` from your workspaces, which only
// works if it's installed. If `moi` doesn't resolve as a command, nudge toward
// a global install. (`Bun.which` honors a custom global bin dir and finds
// installs from any package manager, unlike checking a hardcoded path.)
if (!Bun.which('moi')) {
  console.error('Note: `moi` is not installed as a command — this run is temporary.')
  console.error(
    'Install it so the command stays available (the agent calls it from your workspaces):'
  )
  console.error('  bun i -g moi-computer\n')
}

await import('../server/cli.ts')
