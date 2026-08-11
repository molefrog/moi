import { expect, test } from 'bun:test'

import { drawingCaptureScale } from './capture-element'

test('keeps normal captures sharp and caps very large screenshots', () => {
  expect(drawingCaptureScale(700, 500, 2)).toBe(2)
  expect(drawingCaptureScale(2_000, 1_000, 2)).toBeCloseTo(0.784)
  expect(drawingCaptureScale(0, 0, 2)).toBe(1)
})
