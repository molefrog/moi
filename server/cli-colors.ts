// Disable ANSI color when stdout is not a TTY — e.g. an agent capturing
// `moi scratch --help` through a pipe.
//
// citty colors its usage and error output *unconditionally*: its color helper
// keys off env vars (`NO_COLOR`/`TERM`/`CI`/`TEST`) and never checks `isTTY`, so
// without this an agent sees literal `[36m`/`[1m` escape noise instead of
// readable help. We set `NO_COLOR` here so citty's color helpers no-op. This
// module is imported *first* in `cli.ts` so it runs before citty's module is
// evaluated (citty computes its `noColor` flag once, at import time).
//
// picocolors (our own coloring) already auto-detects `isTTY`, so this only
// closes citty's gap. `FORCE_COLOR` and an explicit `NO_COLOR` are honored: if
// the user opted in or out of color, we leave their choice untouched.

if (!process.stdout.isTTY && !process.env.FORCE_COLOR && process.env.NO_COLOR == null) {
  process.env.NO_COLOR = '1'
}
