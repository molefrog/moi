// Rasterizes a workspace icon (emoji or Tabler glyph, over an optional gradient
// background) into a PNG Blob, ready to PUT to `/api/workspaces/:id/icon` — the
// server normalizes it to a 128×128 WebP. Keeping everything in the existing
// image pipeline means the sidebar and header keep rendering icons as a plain
// `<img>`, with no schema change for emoji/glyph modes.

// Generative gradient presets offered for emoji/glyph backgrounds. `css` is the
// Tailwind arbitrary-value gradient for live DOM previews; `from`/`to` feed the
// canvas gradient when rasterizing. `none` is handled separately (transparent).
export type IconBackground = 'none' | 'blue' | 'violet' | 'sunset' | 'emerald' | 'rose'

export const ICON_BACKGROUNDS: {
  id: Exclude<IconBackground, 'none'>
  css: string
  from: string
  to: string
}[] = [
  {
    id: 'blue',
    css: 'bg-[linear-gradient(135deg,#60a5fa,#2563eb)]',
    from: '#60a5fa',
    to: '#2563eb'
  },
  {
    id: 'violet',
    css: 'bg-[linear-gradient(135deg,#c084fc,#7c3aed)]',
    from: '#c084fc',
    to: '#7c3aed'
  },
  {
    id: 'sunset',
    css: 'bg-[linear-gradient(135deg,#fbbf24,#ef4444)]',
    from: '#fbbf24',
    to: '#ef4444'
  },
  {
    id: 'emerald',
    css: 'bg-[linear-gradient(135deg,#34d399,#059669)]',
    from: '#34d399',
    to: '#059669'
  },
  {
    id: 'rose',
    css: 'bg-[linear-gradient(135deg,#fb7185,#db2777)]',
    from: '#fb7185',
    to: '#db2777'
  }
]

// Rendered at 2× the server's target so the downscale to 128 stays crisp.
const SIZE = 256

function paintBackground(ctx: CanvasRenderingContext2D, bg: IconBackground) {
  if (bg === 'none') return
  const preset = ICON_BACKGROUNDS.find(b => b.id === bg)
  if (!preset) return
  const gradient = ctx.createLinearGradient(0, 0, SIZE, SIZE)
  gradient.addColorStop(0, preset.from)
  gradient.addColorStop(1, preset.to)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, SIZE, SIZE)
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('Canvas is empty'))),
      'image/png'
    )
  })
}

function newCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  return [canvas, ctx]
}

// Rasterize a single emoji centered over the chosen background.
export async function renderEmojiIcon(emoji: string, bg: IconBackground): Promise<Blob> {
  const [canvas, ctx] = newCanvas()
  paintBackground(ctx, bg)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `${Math.round(SIZE * 0.58)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`
  // Nudge down slightly — emoji glyphs sit high of the geometric center.
  ctx.fillText(emoji, SIZE / 2, SIZE / 2 + SIZE * 0.04)
  return toBlob(canvas)
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load SVG'))
    img.src = src
  })
}

// Rasterize a Tabler glyph (passed as serialized SVG markup) centered over the
// chosen background. The glyph is recolored white on a gradient, near-black when
// the background is transparent, so it reads in either case.
export async function renderGlyphIcon(svg: string, bg: IconBackground): Promise<Blob> {
  const [canvas, ctx] = newCanvas()
  paintBackground(ctx, bg)
  const color = bg === 'none' ? '#18181b' : '#ffffff'
  const colored = svg.replace(/currentColor/g, color)
  const img = await loadImage(`data:image/svg+xml;utf8,${encodeURIComponent(colored)}`)
  const glyph = SIZE * 0.56
  const offset = (SIZE - glyph) / 2
  ctx.drawImage(img, offset, offset, glyph, glyph)
  return toBlob(canvas)
}
