import { stringHash } from 'facehash'

import { COLLAB_MAX_AVATAR_BYTES } from '@/lib/collab/protocol'

// Rasterizes a facehash face (https://facehash.dev) into a small PNG data URL,
// so a test avatar travels inside the identity instead of pointing at a URL.
// The library paints its faces with React and CSS, which a canvas cannot
// consume, so the eye shapes and their selection are mirrored here: a name gets
// the same face it gets from the library. This is the library's solid variant;
// its gradient sheen alone costs more than the protocol's avatar budget.

type Face = { width: number; height: number; draw: (ctx: CanvasRenderingContext2D) => void }

function circle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()
}

function pill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, 3.5)
  ctx.fill()
}

const CURVED_EYE =
  'M0 5.1c0-.1 0-.2 0-.3.1-.5.3-1 .7-1.3.1 0 .1-.1.2-.1C2.4 2.2 6 0 10.5 0S18.6 2.2 20.2 3.3c.1 0 .1.1.1.1.4.3.7.9.7 1.3v.3c0 1 0 1.4 0 1.7-.2 1.3-1.2 1.9-2.5 1.6-.2 0-.7-.3-1.8-.8C15 6.7 12.8 6 10.5 6s-4.5.7-6.3 1.5c-1 .5-1.5.7-1.8.8-1.3.3-2.3-.3-2.5-1.6v-1.7z'

// Same order as the library: round, cross, line, curved.
const FACES: Face[] = [
  {
    width: 63,
    height: 15,
    draw: ctx => {
      circle(ctx, 7.2, 7.2, 7.2)
      circle(ctx, 55.2, 7.2, 7.2)
    }
  },
  {
    width: 71,
    height: 23,
    draw: ctx => {
      pill(ctx, 8, 0, 7, 23)
      pill(ctx, 0, 8, 23, 7)
      pill(ctx, 55.2, 0, 7, 23)
      pill(ctx, 47.3, 8, 23, 7)
    }
  },
  {
    width: 82,
    height: 8,
    draw: ctx => {
      pill(ctx, 0.07, 0.16, 6.9, 6.9)
      pill(ctx, 7.9, 0.16, 20.7, 6.9)
      pill(ctx, 74.7, 0.16, 6.9, 6.9)
      pill(ctx, 53.1, 0.16, 20.7, 6.9)
    }
  },
  {
    width: 63,
    height: 9,
    draw: ctx => {
      const eye = new Path2D(CURVED_EYE)
      ctx.fill(eye)
      ctx.translate(42, 0)
      ctx.fill(eye)
    }
  }
]

// The library tilts the face in 3D; its image renderer flattens that into a
// small nudge, which is what a raster copy can reproduce.
const TILTS = [
  [-1, 1],
  [1, 1],
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, 0],
  [0, -1],
  [-1, -1],
  [1, -1]
] as const

// Crisp at the largest host avatar on a 2x display, and a few kilobytes as PNG.
const SIZE = 96

function drawFace(ctx: CanvasRenderingContext2D, name: string, color: string, size: number): void {
  const hash = stringHash(name)
  const face = FACES[hash % FACES.length] ?? FACES[0]
  const [tiltX, tiltY] = TILTS[hash % TILTS.length] ?? [0, 0]
  const dx = tiltY * size * 0.05
  const dy = -tiltX * size * 0.05

  ctx.fillStyle = color
  ctx.fillRect(0, 0, size, size)

  const eyesWidth = size * 0.6
  const eyesHeight = (eyesWidth * face.height) / face.width
  const gap = size * 0.08
  const fontSize = size * 0.26
  const top = (size - (eyesHeight + gap + fontSize)) / 2

  ctx.save()
  ctx.translate((size - eyesWidth) / 2 + dx, top + dy)
  ctx.scale(eyesWidth / face.width, eyesWidth / face.width)
  ctx.fillStyle = '#000'
  face.draw(ctx)
  ctx.restore()

  ctx.fillStyle = '#000'
  ctx.font = `700 ${fontSize}px ui-monospace, Menlo, monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(
    name.charAt(0).toUpperCase(),
    size / 2 + dx,
    top + eyesHeight + gap + fontSize / 2 + dy
  )
}

export function facehashDataUrl(name: string, color: string): string | undefined {
  if (typeof document === 'undefined') return undefined
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) return undefined
  drawFace(ctx, name, color, SIZE)
  const url = canvas.toDataURL('image/png')
  return url.length <= COLLAB_MAX_AVATAR_BYTES ? url : undefined
}
