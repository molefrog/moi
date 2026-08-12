import { describe, expect, test } from 'bun:test'

import {
  drawingHistoryReducer,
  EMPTY_DRAWING_HISTORY,
  pointOnCanvas,
  type DrawingStroke
} from './useDrawingLayer'

const firstStroke: DrawingStroke = {
  points: [
    { x: 10, y: 20 },
    { x: 30, y: 40 }
  ]
}
const secondStroke: DrawingStroke = {
  points: [
    { x: 50, y: 60 },
    { x: 70, y: 80 }
  ]
}

describe('drawing history', () => {
  test('commits immutable strokes and supports undo and redo', () => {
    const one = drawingHistoryReducer(EMPTY_DRAWING_HISTORY, {
      type: 'commit',
      stroke: firstStroke
    })
    const two = drawingHistoryReducer(one, { type: 'commit', stroke: secondStroke })
    const undone = drawingHistoryReducer(two, { type: 'undo' })
    const redone = drawingHistoryReducer(undone, { type: 'redo' })

    expect(one.present).toEqual([firstStroke])
    expect(two.present).toEqual([firstStroke, secondStroke])
    expect(undone.present).toEqual([firstStroke])
    expect(redone.present).toEqual(two.present)
    expect(EMPTY_DRAWING_HISTORY.present).toEqual([])
  })

  test('treats clear as an undoable history entry', () => {
    const drawn = drawingHistoryReducer(EMPTY_DRAWING_HISTORY, {
      type: 'commit',
      stroke: firstStroke
    })
    const cleared = drawingHistoryReducer(drawn, { type: 'clear' })
    const restored = drawingHistoryReducer(cleared, { type: 'undo' })

    expect(cleared.present).toEqual([])
    expect(restored.present).toEqual([firstStroke])
  })

  test('a new stroke drops redo history', () => {
    const one = drawingHistoryReducer(EMPTY_DRAWING_HISTORY, {
      type: 'commit',
      stroke: firstStroke
    })
    const two = drawingHistoryReducer(one, { type: 'commit', stroke: secondStroke })
    const undone = drawingHistoryReducer(two, { type: 'undo' })
    const branched = drawingHistoryReducer(undone, {
      type: 'commit',
      stroke: secondStroke
    })

    expect(branched.future).toEqual([])
  })
})

test('maps viewport pointer coordinates into screenshot canvas coordinates', () => {
  const canvas = {
    width: 800,
    height: 400,
    getBoundingClientRect: () => ({ left: 100, top: 50, width: 400, height: 200 })
  } as unknown as HTMLCanvasElement

  expect(pointOnCanvas(canvas, 300, 150)).toEqual({ x: 400, y: 200 })
})
