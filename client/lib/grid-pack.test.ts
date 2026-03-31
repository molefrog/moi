import { describe, expect, test } from 'bun:test'
import type { LayoutItem } from 'react-grid-layout'

import { findFreePosition, packItems } from './grid-pack'

// helpers
const item = (i: string, x: number, y: number, w: number, h: number): LayoutItem => ({
  i,
  x,
  y,
  w,
  h
})

describe('findFreePosition', () => {
  test('returns (0,0) on empty grid', () => {
    expect(findFreePosition([], 2, 1, 4)).toEqual({ x: 0, y: 0 })
  })

  test('places item after a full first row', () => {
    const existing = [item('a', 0, 0, 4, 1)]
    expect(findFreePosition(existing, 2, 1, 4)).toEqual({ x: 0, y: 1 })
  })

  test('fills the gap left by a removed item', () => {
    // row 0: [A(2wide)] [gap(2wide)]
    const existing = [item('a', 0, 0, 2, 1)]
    expect(findFreePosition(existing, 2, 1, 4)).toEqual({ x: 2, y: 0 })
  })

  test('skips positions that would overflow cols', () => {
    // 3-wide item can only start at x=0 or x=1 in a 4-col grid
    const existing = [item('a', 0, 0, 2, 1)]
    // x=0 overlaps, x=1 would overflow (1+3>4), so next row
    expect(findFreePosition(existing, 3, 1, 4)).toEqual({ x: 0, y: 1 })
  })

  test('handles tall items — finds row with enough vertical space', () => {
    const existing = [item('a', 0, 0, 4, 2)]
    expect(findFreePosition(existing, 2, 2, 4)).toEqual({ x: 0, y: 2 })
  })

  test('fits a 1x1 in a small gap between taller items', () => {
    // [A(1x2)] [gap(1x1)] [B(1x2)] [C(1x2)]
    //           ^-- row 0, x=1 is free for 1 row
    const existing = [item('a', 0, 0, 1, 2), item('b', 2, 0, 1, 2), item('c', 3, 0, 1, 2)]
    expect(findFreePosition(existing, 1, 1, 4)).toEqual({ x: 1, y: 0 })
  })

  test('2x2 item cannot fit in a 1x2 gap', () => {
    const existing = [item('a', 0, 0, 1, 2), item('b', 2, 0, 2, 2)]
    // gap is 1 wide (x=1), 2x2 won't fit there → goes to row 2
    expect(findFreePosition(existing, 2, 2, 4)).toEqual({ x: 0, y: 2 })
  })
})

describe('packItems', () => {
  test('packs a single item onto empty grid', () => {
    const result = packItems([{ id: 'a', w: 2, h: 1 }])
    expect(result).toEqual([item('a', 0, 0, 2, 1)])
  })

  test('respects explicit x/y and does not repack', () => {
    const result = packItems([{ id: 'a', w: 2, h: 1, x: 2, y: 3 }])
    expect(result).toEqual([item('a', 2, 3, 2, 1)])
  })

  test('multiple items do not overlap each other', () => {
    const items = [
      { id: 'a', w: 2, h: 1 },
      { id: 'b', w: 2, h: 1 },
      { id: 'c', w: 2, h: 1 }
    ]
    const result = packItems(items)
    // a: (0,0), b: (2,0), c: (0,1)
    expect(result[0]).toEqual(item('a', 0, 0, 2, 1))
    expect(result[1]).toEqual(item('b', 2, 0, 2, 1))
    expect(result[2]).toEqual(item('c', 0, 1, 2, 1))
  })

  test('new items avoid existing layout items', () => {
    const existing = [item('a', 0, 0, 4, 1)]
    const result = packItems([{ id: 'b', w: 2, h: 1 }], existing)
    expect(result[0]).toEqual(item('b', 0, 1, 2, 1))
  })

  test('respects custom cols', () => {
    const result = packItems(
      [
        { id: 'a', w: 1, h: 1 },
        { id: 'b', w: 1, h: 1 }
      ],
      [],
      2
    )
    expect(result[0]).toEqual(item('a', 0, 0, 1, 1))
    expect(result[1]).toEqual(item('b', 1, 0, 1, 1))
  })
})
