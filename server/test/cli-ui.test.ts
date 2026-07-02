import { describe, expect, test } from 'bun:test'

import { columns, keyValue } from '../cli-ui'

const RED = '\x1b[31m'
const RESET = '\x1b[39m'

describe('columns', () => {
  test('aligns cells to the widest value per column, two-space indent', () => {
    const out = columns(
      ['kind', 'name', 'status'],
      [
        ['widget', 'stats-overview', 'built'],
        ['view', 'insta', 'skipped']
      ]
    )
    expect(out).toBe(
      [
        '  kind    name            status',
        '  widget  stats-overview  built',
        '  view    insta           skipped'
      ].join('\n')
    )
  })

  test('never pads the last column and trims trailing whitespace', () => {
    const out = columns(['a', 'b'], [['xx', 'y']])
    for (const line of out.split('\n')) expect(line).toBe(line.replace(/\s+$/, ''))
    expect(out.split('\n')[0]).toBe('  a   b')
  })

  test('measures visible width, ignoring ANSI escapes, so colored cells still align', () => {
    const out = columns(['status'], [[`${RED}built${RESET}`], ['skipped']])
    // Single column → no padding applied, but the colored cell must round-trip
    // intact (escapes preserved, not counted toward width).
    expect(out).toBe(['  status', `  ${RED}built${RESET}`, '  skipped'].join('\n'))
  })

  test('alignment holds when an earlier column is colored', () => {
    const out = columns(['k', 'v'], [[`${RED}built${RESET}`, 'x']])
    // `built` is 5 visible chars, header `k` is 1 → column width 5, so two
    // spaces follow the (colored) cell's visible end before `x`.
    expect(out).toBe(['  k      v', `  ${RED}built${RESET}  x`].join('\n'))
  })

  test('tolerates short rows (missing trailing cells)', () => {
    const out = columns(['a', 'b', 'c'], [['1', '2']])
    expect(out.split('\n')[1]).toBe('  1  2')
  })
})

describe('keyValue', () => {
  test('pads keys to the widest key (the moi config look)', () => {
    expect(
      keyValue([
        ['name', 'Sergey Avdyakov'],
        ['icon', 'custom']
      ])
    ).toBe(['  name  Sergey Avdyakov', '  icon  custom'].join('\n'))
  })

  test('empty input yields an empty string', () => {
    expect(keyValue([])).toBe('')
  })
})
