// Shell-command normalization. The wrapped-command samples are the shapes
// Codex and OpenClaw actually send (`/bin/bash -lc "…"`, any login shell).
import { describe, expect, test } from 'bun:test'

import { collapseCommand, prettifyShellCommand, unwrapShellCommand } from './shell'

describe('unwrapping a shell wrapper', () => {
  test('lifts the script out of `<shell> -c "…"`', () => {
    expect(
      unwrapShellCommand(
        `/bin/bash -c "sed -n '1,240p' /home/sandbox/firma-os/.agents/skills/moi-workspace/SKILL.md && sed -n '1,240p' .moi/FIRMA.md"`
      )
    ).toBe(
      `sed -n '1,240p' /home/sandbox/firma-os/.agents/skills/moi-workspace/SKILL.md && sed -n '1,240p' .moi/FIRMA.md`
    )
  })

  test('handles any shell, any path, and combined flags', () => {
    const cases = [
      '/bin/zsh -lc "echo hi"',
      '/usr/local/bin/fish -c "echo hi"',
      "sh -c 'echo hi'",
      'bash -lic "echo hi"',
      '/bin/dash -c "echo hi"',
      'env FOO=1 /bin/bash -lc "echo hi"',
      'FOO=1 BAR=2 zsh -c "echo hi"',
      'bash -o pipefail -c "echo hi"'
    ]
    for (const command of cases) expect(unwrapShellCommand(command)).toBe('echo hi')
  })

  test('unescapes one quoting level, single or double', () => {
    // Double quotes: `\"` was the model's `"`, and `\d` must stay a regex.
    expect(unwrapShellCommand('/bin/bash -c "grep \\"foo bar\\" -e \\d+ src"')).toBe(
      'grep "foo bar" -e \\d+ src'
    )
    // Single quotes: literal throughout, including backslashes.
    expect(unwrapShellCommand(`/bin/bash -lc 'grep "foo" -e \\d+ src'`)).toBe(
      'grep "foo" -e \\d+ src'
    )
  })

  test('leaves variables and substitutions in the script alone', () => {
    // `shell-quote` would expand these; the brief must show what the model
    // wrote, since nothing here runs.
    expect(unwrapShellCommand('/bin/bash -lc "echo $HOME/${FOO:-x} $(pwd) `date`"')).toBe(
      'echo $HOME/${FOO:-x} $(pwd) `date`'
    )
    expect(unwrapShellCommand('/bin/bash -lc "echo $((1 + 2))"')).toBe('echo $((1 + 2))')
  })

  test('renders a command the parser rejects as it came', () => {
    // `${}` is a bash syntax error the model can still write; rendering must
    // not throw over it.
    expect(unwrapShellCommand('/bin/bash -lc "echo ${}"')).toBe('/bin/bash -lc "echo ${}"')
  })

  test('keeps globs and pipes inside the script', () => {
    expect(unwrapShellCommand('/bin/bash -lc "ls *.ts | head -5"')).toBe('ls *.ts | head -5')
  })

  test('unwraps a nested wrapper', () => {
    expect(unwrapShellCommand(`/bin/bash -lc "sh -c 'echo hi'"`)).toBe('echo hi')
  })

  test('leaves a plain command alone', () => {
    const cases = [
      'bun test --coverage',
      'git rev-parse --is-inside-work-tree 2>/dev/null && git remote -v',
      'echo "bash -c is just text here"',
      // Quoting the model never closed — refuse to guess.
      '/bin/bash -c "echo hi',
      // Not a shell: the container is the interesting part of the row.
      'docker run --rm alpine sh -c "echo hi"',
      // Positional args after the script bind $0/$1; dropping them would
      // misdescribe the run.
      'bash -c "echo $0" name arg',
      // A shell with no `-c` runs a script file, not a command string.
      '/bin/bash ./deploy.sh'
    ]
    for (const command of cases) expect(unwrapShellCommand(command)).toBe(command)
  })

  test('keeps the wrapper when the script is empty', () => {
    expect(unwrapShellCommand('/bin/bash -c ""')).toBe('/bin/bash -c ""')
  })
})

describe('collapsing to one line', () => {
  test('folds newlines and indentation into single spaces', () => {
    expect(collapseCommand('git add -A\n  git commit -m "wip"')).toBe(
      'git add -A git commit -m "wip"'
    )
  })

  test('drops the backslash of a line continuation', () => {
    expect(collapseCommand('rg foo \\\n  --glob "*.ts"')).toBe('rg foo --glob "*.ts"')
  })

  test('trims the ends', () => {
    expect(collapseCommand('  bun test \n')).toBe('bun test')
  })
})

describe('prettify', () => {
  test('unwraps and collapses a multi-line wrapped script', () => {
    expect(
      prettifyShellCommand('/bin/bash -lc "cd server &&\n  bun test \\\n    --coverage"')
    ).toBe('cd server && bun test --coverage')
  })
})
