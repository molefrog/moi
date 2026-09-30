import { afterEach, expect, test } from 'bun:test'
import type * as MoiApi from 'moi'
import type * as MoiRuntime from '../applets/runtime/moi'

import { APPLET_API_BASE_SENTINEL } from '../applets/api-base'
import { __attachBridge, resolveUrl } from '../applets/runtime/moi'

// Evaluated as the module loads, before the host has attached any bridge.
const videoUrl = resolveUrl('moi:/files/clips/a%20b.mp4#t=5')

afterEach(() => __attachBridge({}))

// Check runtime signatures against the public contract without evaluating React.
const declarationsMatch: typeof MoiRuntime extends typeof MoiApi ? true : false = true

test('moi runtime implements its public declarations', () => {
  expect(declarationsMatch).toBe(true)
})

test('file URLs resolve at module load and retain their source workspace after bridge attachment', () => {
  expect(videoUrl).toBe(`${APPLET_API_BASE_SENTINEL}/files/clips/a%20b.mp4#t=5`)
  __attachBridge({ resolveUrl: () => '/workspace/other/overview' })
  expect(resolveUrl('moi:/files/photo.png')).toBe(`${APPLET_API_BASE_SENTINEL}/files/photo.png`)
  expect(resolveUrl('moi:/views/orders')).toBe('/workspace/other/overview')
})
