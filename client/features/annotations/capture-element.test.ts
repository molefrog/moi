import { expect, test } from 'bun:test'

import { annotationCaptureScale } from './capture-element'

test('keeps normal captures sharp and caps very large screenshots', () => {
  expect(annotationCaptureScale(700, 500, 2)).toBe(2)
  expect(annotationCaptureScale(2_000, 1_000, 2)).toBeCloseTo(0.784)
  expect(annotationCaptureScale(0, 0, 2)).toBe(1)
})
