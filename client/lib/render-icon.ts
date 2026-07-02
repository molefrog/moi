// Rasterizes a workspace icon (emoji or Tabler glyph, over an optional gradient
// background) into a PNG Blob, ready to PUT to `/api/workspaces/:id/icon` — the
// server normalizes it to a 128×128 WebP. Keeping everything in the existing
// image pipeline means the sidebar and header keep rendering icons as a plain
// `<img>`, with no schema change for emoji/glyph modes.

// A gradient background: a CSS-style angle (0deg = up, clockwise) and 2–3 hex
// stops, ordered light → dark. Rendered identically by the DOM preview
// (`gradientCss`) and the canvas rasterizer (`paintGradient`), both of which
// finish with a soft radial sheen for depth.
export type IconGradient = {
  angle: number
  stops: string[]
}

// Hand-tuned presets shown as swatches. `randomGradient()` below generates
// endless extras in the same family.
export const GRADIENT_PRESETS: { id: string; gradient: IconGradient }[] = [
  { id: 'sunrise', gradient: { angle: 140, stops: ['#FFE29F', '#FFA99F', '#FF719A'] } },
  { id: 'ocean', gradient: { angle: 135, stops: ['#67E8F9', '#3B82F6', '#4F46E5'] } },
  { id: 'meadow', gradient: { angle: 135, stops: ['#A7F3D0', '#34D399', '#059669'] } },
  { id: 'dusk', gradient: { angle: 120, stops: ['#C471F5', '#FA71CD'] } },
  { id: 'midnight', gradient: { angle: 135, stops: ['#30CFD0', '#330867'] } }
]

// OKLCH → sRGB hex. Generating in OKLCH keeps random gradients perceptually
// even — equal lightness/chroma reads equally vivid at any hue, which is what
// makes the shuffle output feel curated rather than arbitrary.
function oklchToHex(l: number, c: number, h: number): string {
  const hr = (h * Math.PI) / 180
  const a = c * Math.cos(hr)
  const b = c * Math.sin(hr)
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  const channels = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_
  ]
  return `#${channels
    .map(x => {
      const clamped = Math.min(1, Math.max(0, x))
      const srgb = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055
      return Math.round(srgb * 255)
        .toString(16)
        .padStart(2, '0')
    })
    .join('')}`
}

// Generate a fresh gradient: random hue, a 35–90° hue swing toward the dark
// end, light→dark diagonal. A third mid-stop drops in ~40% of the time for
// richer blends.
export function randomGradient(): IconGradient {
  const hue = Math.random() * 360
  const swing = (35 + Math.random() * 55) * (Math.random() < 0.5 ? -1 : 1)
  const angle = Math.round(115 + Math.random() * 55)
  const light = oklchToHex(0.83 + Math.random() * 0.06, 0.09 + Math.random() * 0.06, hue)
  const dark = oklchToHex(0.5 + Math.random() * 0.14, 0.17 + Math.random() * 0.07, hue + swing)
  if (Math.random() < 0.4) {
    const mid = oklchToHex(0.7 + Math.random() * 0.05, 0.15, hue + swing / 2)
    return { angle, stops: [light, mid, dark] }
  }
  return { angle, stops: [light, dark] }
}

// Sheen shared by the DOM preview and the canvas: a soft white radial glow off
// the top-left, like light hitting a rounded app icon.
const SHEEN_CSS =
  'radial-gradient(120% 100% at 28% 12%, rgba(255,255,255,0.32), rgba(255,255,255,0) 58%)'

// CSS `background` value for previewing a gradient in the DOM. Colors are
// runtime-generated (shuffle), so this goes through a style attribute — a
// static Tailwind class can't express it.
export function gradientCss(g: IconGradient): string {
  return `${SHEEN_CSS}, linear-gradient(${g.angle}deg, ${g.stops.join(', ')})`
}

// Rendered at 2× the server's target so the downscale to 128 stays crisp.
const SIZE = 256

function paintGradient(ctx: CanvasRenderingContext2D, g: IconGradient) {
  // CSS angle semantics: 0deg points up, rotating clockwise. The gradient line
  // runs through the center, long enough to cover the square's projection.
  const rad = (g.angle * Math.PI) / 180
  const dx = Math.sin(rad)
  const dy = -Math.cos(rad)
  const half = (SIZE * (Math.abs(dx) + Math.abs(dy))) / 2
  const c = SIZE / 2
  const lin = ctx.createLinearGradient(c - dx * half, c - dy * half, c + dx * half, c + dy * half)
  const last = g.stops.length - 1
  g.stops.forEach((stop, i) => lin.addColorStop(last === 0 ? 0 : i / last, stop))
  ctx.fillStyle = lin
  ctx.fillRect(0, 0, SIZE, SIZE)

  const sheen = ctx.createRadialGradient(
    SIZE * 0.28,
    SIZE * 0.12,
    0,
    SIZE * 0.28,
    SIZE * 0.12,
    SIZE * 1.1
  )
  sheen.addColorStop(0, 'rgba(255,255,255,0.32)')
  sheen.addColorStop(0.58, 'rgba(255,255,255,0)')
  ctx.fillStyle = sheen
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

// Emoji fill ratios: full-bleed on a transparent background (the emoji IS the
// icon), padded when sitting on a gradient tile.
const EMOJI_BARE = 0.92
const EMOJI_ON_GRADIENT = 0.68

// Rasterize a single emoji centered over the chosen background (null = none).
export async function renderEmojiIcon(emoji: string, bg: IconGradient | null): Promise<Blob> {
  const [canvas, ctx] = newCanvas()
  if (bg) paintGradient(ctx, bg)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const scale = bg ? EMOJI_ON_GRADIENT : EMOJI_BARE
  ctx.font = `${Math.round(SIZE * scale)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`
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

// Glyph fill ratios, matching the emoji treatment.
const GLYPH_BARE = 0.78
const GLYPH_ON_GRADIENT = 0.6

// Rasterize a Tabler glyph (passed as serialized SVG markup) centered over the
// chosen background. The glyph is recolored white on a gradient, near-black when
// the background is transparent, so it reads in either case.
export async function renderGlyphIcon(svg: string, bg: IconGradient | null): Promise<Blob> {
  const [canvas, ctx] = newCanvas()
  if (bg) paintGradient(ctx, bg)
  const color = bg ? '#ffffff' : '#18181b'
  const colored = svg.replace(/currentColor/g, color)
  const img = await loadImage(`data:image/svg+xml;utf8,${encodeURIComponent(colored)}`)
  const glyph = SIZE * (bg ? GLYPH_ON_GRADIENT : GLYPH_BARE)
  const offset = (SIZE - glyph) / 2
  ctx.drawImage(img, offset, offset, glyph, glyph)
  return toBlob(canvas)
}
