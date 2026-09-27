// Shell-command display normalization, shared by every provider's shell tool
// (Claude `Bash`, Codex/OpenClaw `exec`/`bash`, Hermes `terminal:` titles).
//
// Agents rarely hand us the command a person would have typed. Codex and
// OpenClaw hand the model's script to the login shell, so the tool input is
// the wrapper invocation:
//
//   /bin/bash -c "sed -n '1,240p' SKILL.md && sed -n '1,240p' .moi/FIRMA.md"
//
// The wrapper is noise in a one-line brief: the shell path and `-lc` eat the
// width, and the inner quoting arrives escaped, so the row shows `\"` where
// the model wrote `"`. Rendering strips the wrapper and removes one quoting
// level, leaving what actually ran:
//
//   sed -n '1,240p' SKILL.md && sed -n '1,240p' .moi/FIRMA.md
//
// Word splitting is `shell-quote`'s, not ours — quoting rules have too many
// corners (`'` inside `"`, `\d` staying literal, `$(…)` and backticks passing
// through) to re-derive here.
//
// Display only — nothing here feeds execution, so an unrecognized shape is
// never an error: every step falls back to the raw command unchanged.
import { parse } from 'shell-quote'

import type { Shorten } from './shared'

// `shell-quote` resolves `$VAR` through this callback, defaulting to the empty
// string. We render commands rather than run them, so put the variable back
// verbatim. Braces only survive where they carry meaning (`${FOO:-x}`); a bare
// `${FOO}` reads the same without them. A command or arithmetic substitution
// (`$(pwd)`, `$((1+2))`) arrives here as an empty key — a bare `$` restores it.
function keepVariable(key: string): string {
  if (!key) return '$'
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ? `$${key}` : `\${${key}}`
}

// `shell-quote` throws on a few malformed inputs (`${}`), and a streaming tool
// call can always show us a half-written command. Unparseable means "render it
// as it came".
function splitWords(command: string): ReturnType<typeof parse> | null {
  try {
    return parse(command, keepVariable)
  } catch {
    return null
  }
}

function basename(path: string): string {
  return path.split('/').pop() ?? path
}

// Shells whose `-c` argument is a command string we can lift out. Keep this to
// real shells: unwrapping `docker run … sh -c …` would hide where the command
// ran, which is the useful part of that row.
const SHELLS = new Set([
  'bash',
  'sh',
  'zsh',
  'fish',
  'dash',
  'ash',
  'ksh',
  'mksh',
  'csh',
  'tcsh',
  'nu',
  'pwsh',
  'powershell'
])

// Flags that consume the next word, so it isn't mistaken for the script
// (`bash -o pipefail -c …`).
const FLAGS_WITH_VALUE = new Set(['-o', '+o', '-O', '+O', '--rcfile', '--init-file'])

const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/

// `-c`, plus the combined short forms shells are usually invoked with (`-lc`,
// `-ic`, `-euc`) and the long spellings (`--command`, pwsh's `-Command`).
function isCommandFlag(word: string): boolean {
  if (/^-[a-zA-Z]*c$/.test(word)) return true
  const lower = word.toLowerCase()
  return lower === '--command' || lower === '-command'
}

// One unwrap pass: `[VAR=v …] [env] <shell> [flags] -c <script>` → `<script>`.
// Returns null when the command isn't that shape, which means "leave it alone".
function unwrapOnce(command: string): string | null {
  // Operators, globs and comments come back as objects rather than strings;
  // a wrapper invocation is plain words all the way to the script, so a
  // non-string where a word belongs ends the match.
  const words = splitWords(command)
  if (!words || words.length < 3) return null
  const word = (index: number): string | null => {
    const entry = words[index]
    return typeof entry === 'string' ? entry : null
  }

  let i = 0
  const skipAssignments = () => {
    while (ENV_ASSIGNMENT.test(word(i) ?? '')) i++
  }
  skipAssignments()
  if (basename(word(i) ?? '') === 'env') {
    i++
    skipAssignments()
  }

  if (!SHELLS.has(basename(word(i) ?? ''))) return null
  i++

  while (i < words.length) {
    const flag = word(i)
    if (flag === null) return null
    if (isCommandFlag(flag)) {
      // The script must be the final word. `bash -c script name arg` binds the
      // extra words to `$0`/`$1`, and a brief that dropped them would claim the
      // run was something it wasn't.
      if (i + 2 !== words.length) return null
      const script = word(i + 1)?.trim()
      return script || null
    }
    if (!flag.startsWith('-') && !flag.startsWith('+')) return null
    i += FLAGS_WITH_VALUE.has(flag) ? 2 : 1
  }
  return null
}

// Strip shell wrappers down to the command that actually ran. Bounded, because
// wrappers nest in practice (a `bash -lc` that runs `sh -c …`) and a malformed
// self-similar string must not loop.
export function unwrapShellCommand(command: string): string {
  let out = command
  for (let pass = 0; pass < 3; pass++) {
    const inner = unwrapOnce(out)
    if (inner === null) return out
    out = inner
  }
  return out
}

// Flatten a command to one line: the brief is a single truncating row, so a
// multi-line script would otherwise render as its first line with the rest
// silently collapsed by the browser, and its indentation as a wide gap.
export function collapseCommand(command: string): string {
  return command
    .replace(/\\\r?\n[ \t]*/g, ' ') // line continuations: drop the backslash too
    .replace(/[ \t]*\r?\n[ \t]*/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

// The rendered form of a shell command: wrapper stripped, one line.
export function prettifyShellCommand(command: string): string {
  return collapseCommand(unwrapShellCommand(command))
}

// The `$ …` brief every provider's shell tool shows. Empty command → empty
// brief, so the row falls back to the bare label instead of a lone `$`.
export function shellBrief(command: string, shorten: Shorten): string {
  const pretty = prettifyShellCommand(command)
  return pretty ? shorten(`$ ${pretty}`) : ''
}
