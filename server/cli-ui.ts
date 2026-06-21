// Plain-text CLI formatting — borderless, alignment-only, no unconditional ANSI.
//
// moi's commands are run by an agent at least as often as by a human. cli-table3
// (the previous renderer) colored its borders and header cells *unconditionally*
// — even into a pipe — so an agent capturing `moi bundle 2>&1` got literal
// `[90m`/`[31m` escape noise instead of a readable table. These helpers render
// aligned columns/rows identically whether stdout is a TTY or a pipe.
//
// Cells stay color-agnostic: a caller may wrap a cell in picocolors (which
// no-ops when stdout isn't a TTY, so it never reaches the agent as noise) and
// alignment still holds — widths are measured on the *visible* text, with ANSI
// escapes stripped.

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g

function visibleWidth(s: string): number {
  return s.replace(ANSI_RE, '').length
}

function padEndVisible(s: string, width: number): string {
  return s + ' '.repeat(Math.max(0, width - visibleWidth(s)))
}

// A borderless table: a header row plus body rows. Each cell is left-aligned to
// its column's widest value, columns separated by two spaces, every line
// indented. The last column is never padded (no trailing whitespace). Mirrors
// the `moi config` look.
export function columns(headers: string[], rows: string[][], indent = '  '): string {
  const ncols = headers.length
  const all = [headers, ...rows]
  const widths = Array.from({ length: ncols }, (_, i) =>
    Math.max(0, ...all.map(r => visibleWidth(r[i] ?? '')))
  )
  const renderRow = (cells: string[]): string => {
    const out = Array.from({ length: ncols }, (_, i) => {
      const cell = cells[i] ?? ''
      return i === ncols - 1 ? cell : padEndVisible(cell, widths[i])
    })
    return (indent + out.join('  ')).replace(/\s+$/, '')
  }
  return [renderRow(headers), ...rows.map(renderRow)].join('\n')
}

// Aligned key/value rows, like `moi config`'s identity block: keys padded to the
// widest key, two spaces between key and value, indented.
export function keyValue(rows: [string, string][], indent = '  '): string {
  const keyWidth = Math.max(0, ...rows.map(([k]) => visibleWidth(k)))
  return rows
    .map(([k, v]) => (indent + padEndVisible(k, keyWidth) + '  ' + v).replace(/\s+$/, ''))
    .join('\n')
}
