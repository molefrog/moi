import { describe, expect, test } from 'bun:test'

import {
  annotationHistoryReducer,
  EMPTY_ANNOTATION_HISTORY,
  pointOnCanvas,
  type AnnotationStroke
} from './useAnnotationLayer'

const firstStroke: AnnotationStroke = {
  points: [
    { x: 10, y: 20 },
    { x: 30, y: 40 }
  ]
}
const secondStroke: AnnotationStroke = {
  points: [
    { x: 50, y: 60 },
    { x: 70, y: 80 }
  ]
}

describe('annotation history', () => {
  test('commits immutable strokes and supports undo and redo', () => {
    const one = annotationHistoryReducer(EMPTY_ANNOTATION_HISTORY, {
      type: 'commit',
      stroke: firstStroke
    })
    const two = annotationHistoryReducer(one, { type: 'commit', stroke: secondStroke })
    const undone = annotationHistoryReducer(two, { type: 'undo' })
    const redone = annotationHistoryReducer(undone, { type: 'redo' })

    expect(one.present).toEqual([firstStroke])
    expect(two.present).toEqual([firstStroke, secondStroke])
    expect(undone.present).toEqual([firstStroke])
    expect(redone.present).toEqual(two.present)
    expect(EMPTY_ANNOTATION_HISTORY.present).toEqual([])
  })

  test('treats clear as an undoable history entry', () => {
    const drawn = annotationHistoryReducer(EMPTY_ANNOTATION_HISTORY, {
      type: 'commit',
      stroke: firstStroke
    })
    const cleared = annotationHistoryReducer(drawn, { type: 'clear' })
    const restored = annotationHistoryReducer(cleared, { type: 'undo' })

    expect(cleared.present).toEqual([])
    expect(restored.present).toEqual([firstStroke])
  })

  test('a new stroke drops redo history', () => {
    const one = annotationHistoryReducer(EMPTY_ANNOTATION_HISTORY, {
      type: 'commit',
      stroke: firstStroke
    })
    const two = annotationHistoryReducer(one, { type: 'commit', stroke: secondStroke })
    const undone = annotationHistoryReducer(two, { type: 'undo' })
    const branched = annotationHistoryReducer(undone, {
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
