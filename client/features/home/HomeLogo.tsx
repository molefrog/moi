import { useEffect, useRef } from 'react'

import { cn } from '@/client/lib/cn'

const GLYPH_ROWS = [
  ['OOOOO', 'O.O.O', 'O.O.O'],
  ['OOO', 'O.O', 'OOO'],
  ['O', 'O', 'O']
] as const

const CELL_SIZE = 10
const CELL_GAP = 3
const CELL_RADIUS = 2.5
const CELL_OPACITY: Record<string, number> = { O: 1, o: 0.5, '.': 0 }

const INTRO_DURATION = 3000
const INTRO_SEED = 2
const INTRO_SPREAD = 3
const FIELD_SPACING = 3
const REST_THRESHOLD = 1e-3

const WAVE_PARAMS = {
  courantSquared: 0.14,
  damping: 0.976,
  driveAmplitude: 1.4,
  driveFrequency: 0.027,
  gain: 0.65,
  fadeIn: 0.36,
  fadeOut: 0.1
} as const

type Pixel = {
  x: number
  y: number
  centerX: number
  centerY: number
  targetOpacity: number
}

type GlyphGeometry = {
  width: number
  height: number
  fieldColumns: number
  fieldRows: number
  pixels: Pixel[]
}

function buildGlyph(rows: readonly string[]): GlyphGeometry {
  const columns = Math.max(...rows.map(row => row.length))
  const width = columns * CELL_SIZE + (columns - 1) * CELL_GAP
  const height = rows.length * CELL_SIZE + (rows.length - 1) * CELL_GAP
  const pixels: Pixel[] = []

  rows.forEach((row, rowIndex) => {
    Array.from(row).forEach((cell, columnIndex) => {
      const targetOpacity = CELL_OPACITY[cell]
      if (targetOpacity === undefined) return

      const x = columnIndex * (CELL_SIZE + CELL_GAP)
      const y = rowIndex * (CELL_SIZE + CELL_GAP)
      pixels.push({
        x,
        y,
        centerX: x + CELL_SIZE / 2,
        centerY: y + CELL_SIZE / 2,
        targetOpacity
      })
    })
  })

  return {
    width,
    height,
    fieldColumns: Math.round(width / FIELD_SPACING) + 1,
    fieldRows: Math.round(height / FIELD_SPACING) + 1,
    pixels
  }
}

const GLYPHS = GLYPH_ROWS.map(buildGlyph)

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

function easeInOut(value: number): number {
  return value < 0.5 ? 2 * value * value : 1 - (-2 * value + 2) ** 2 / 2
}

class GlyphWaveEngine {
  private readonly rects: (SVGRectElement | null)[]
  private readonly svg: SVGSVGElement
  private readonly geometry: GlyphGeometry
  private animationFrame = 0
  private running = false
  private intro = true
  private introStartedAt = -1
  private field: Float32Array
  private previousField: Float32Array
  private nextField: Float32Array
  private pointerActive = false
  private pointerX = 0
  private pointerY = 0
  private activation = 0

  constructor(rects: (SVGRectElement | null)[], svg: SVGSVGElement, geometry: GlyphGeometry) {
    this.rects = rects
    this.svg = svg
    this.geometry = geometry
    const fieldSize = geometry.fieldColumns * geometry.fieldRows
    this.field = new Float32Array(fieldSize)
    this.previousField = new Float32Array(fieldSize)
    this.nextField = new Float32Array(fieldSize)
  }

  start(): void {
    this.seedImpulse()
    this.activation = 1
    this.resume()
  }

  stop(): void {
    cancelAnimationFrame(this.animationFrame)
    this.running = false
  }

  handlePointerMove = (event: PointerEvent): void => {
    const bounds = this.svg.getBoundingClientRect()
    if (!bounds.width || !bounds.height) return

    this.pointerActive =
      event.clientX >= bounds.left &&
      event.clientX <= bounds.right &&
      event.clientY >= bounds.top &&
      event.clientY <= bounds.bottom

    if (this.pointerActive) {
      this.pointerX = ((event.clientX - bounds.left) / bounds.width) * this.geometry.width
      this.pointerY = ((event.clientY - bounds.top) / bounds.height) * this.geometry.height
      this.resume()
    }
  }

  private seedImpulse(): void {
    const centerColumn = Math.round(this.geometry.width / 2 / FIELD_SPACING)
    const centerRow = Math.round(this.geometry.height / 2 / FIELD_SPACING)
    const spread = 2 * INTRO_SPREAD * INTRO_SPREAD

    for (let row = 0; row < this.geometry.fieldRows; row++) {
      for (let column = 0; column < this.geometry.fieldColumns; column++) {
        const distance = (column - centerColumn) ** 2 + (row - centerRow) ** 2
        const value = INTRO_SEED * Math.exp(-distance / spread)
        const index = row * this.geometry.fieldColumns + column
        this.field[index] = value
        this.previousField[index] = value
      }
    }
  }

  private resume(): void {
    if (this.running) return
    this.running = true
    this.animationFrame = requestAnimationFrame(this.animate)
  }

  private animate = (timestamp: number): void => {
    this.stepWave()
    if (this.pointerActive) this.driveWave(timestamp)

    if (this.intro && !this.pointerActive) {
      if (this.introStartedAt < 0) this.introStartedAt = timestamp
      const progress = (timestamp - this.introStartedAt) / INTRO_DURATION
      this.activation = 1 - easeInOut(Math.min(1, progress))
      if (progress >= 1) this.intro = false
    } else {
      this.intro = false
      const target = this.pointerActive ? 1 : 0
      const fade = this.pointerActive ? WAVE_PARAMS.fadeIn : WAVE_PARAMS.fadeOut
      this.activation += (target - this.activation) * fade
    }

    const peak = this.renderWave()
    if (
      this.intro ||
      this.pointerActive ||
      this.activation > REST_THRESHOLD ||
      peak > REST_THRESHOLD
    ) {
      this.animationFrame = requestAnimationFrame(this.animate)
      return
    }

    this.running = false
    this.activation = 0
    this.renderTargets()
  }

  private stepWave(): void {
    const { fieldColumns, fieldRows } = this.geometry

    for (let row = 1; row < fieldRows - 1; row++) {
      for (let column = 1; column < fieldColumns - 1; column++) {
        const index = row * fieldColumns + column
        const laplacian =
          this.field[index - 1] +
          this.field[index + 1] +
          this.field[index - fieldColumns] +
          this.field[index + fieldColumns] -
          4 * this.field[index]
        this.nextField[index] =
          (2 * this.field[index] -
            this.previousField[index] +
            WAVE_PARAMS.courantSquared * laplacian) *
          WAVE_PARAMS.damping
      }
    }

    const previousField = this.previousField
    this.previousField = this.field
    this.field = this.nextField
    this.nextField = previousField
  }

  private driveWave(timestamp: number): void {
    const column = clamp(
      Math.round(this.pointerX / FIELD_SPACING),
      1,
      this.geometry.fieldColumns - 2
    )
    const row = clamp(Math.round(this.pointerY / FIELD_SPACING), 1, this.geometry.fieldRows - 2)
    this.field[row * this.geometry.fieldColumns + column] =
      WAVE_PARAMS.driveAmplitude * Math.sin(timestamp * WAVE_PARAMS.driveFrequency)
  }

  private sampleField(x: number, y: number): number {
    const fieldX = clamp(x / FIELD_SPACING, 0, this.geometry.fieldColumns - 1)
    const fieldY = clamp(y / FIELD_SPACING, 0, this.geometry.fieldRows - 1)
    const left = Math.floor(fieldX)
    const top = Math.floor(fieldY)
    const right = Math.min(left + 1, this.geometry.fieldColumns - 1)
    const bottom = Math.min(top + 1, this.geometry.fieldRows - 1)
    const offsetX = fieldX - left
    const offsetY = fieldY - top
    const { fieldColumns } = this.geometry
    const topLeft = this.field[top * fieldColumns + left]
    const topRight = this.field[top * fieldColumns + right]
    const bottomLeft = this.field[bottom * fieldColumns + left]
    const bottomRight = this.field[bottom * fieldColumns + right]

    return (
      (topLeft * (1 - offsetX) + topRight * offsetX) * (1 - offsetY) +
      (bottomLeft * (1 - offsetX) + bottomRight * offsetX) * offsetY
    )
  }

  private renderWave(): number {
    let peak = 0

    this.geometry.pixels.forEach((pixel, index) => {
      const element = this.rects[index]
      if (!element) return

      const sample = this.sampleField(pixel.centerX, pixel.centerY)
      peak = Math.max(peak, Math.abs(sample))
      const waveOpacity = clamp(0.5 + sample * WAVE_PARAMS.gain, 0, 1)
      const opacity = pixel.targetOpacity * (1 - this.activation) + waveOpacity * this.activation
      element.setAttribute('opacity', opacity.toFixed(3))
    })

    return peak
  }

  private renderTargets(): void {
    this.geometry.pixels.forEach((pixel, index) => {
      this.rects[index]?.setAttribute('opacity', String(pixel.targetOpacity))
    })
  }
}

type HomeLogoGlyphProps = {
  geometry: GlyphGeometry
}

function HomeLogoGlyph({ geometry }: HomeLogoGlyphProps) {
  const rects = useRef<(SVGRectElement | null)[]>([])
  const svgRef = useRef<SVGSVGElement | null>(null)

  useEffect(() => {
    const svg = svgRef.current
    if (!svg || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const engine = new GlyphWaveEngine(rects.current, svg, geometry)
    engine.start()
    window.addEventListener('pointermove', engine.handlePointerMove)

    return () => {
      engine.stop()
      window.removeEventListener('pointermove', engine.handlePointerMove)
    }
  }, [geometry])

  return (
    <svg
      ref={svgRef}
      className="h-8 w-auto"
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
      fill="currentColor"
      aria-hidden="true"
    >
      {geometry.pixels.map((pixel, index) => (
        <rect
          key={`${pixel.x}-${pixel.y}`}
          ref={element => {
            rects.current[index] = element
          }}
          x={pixel.x}
          y={pixel.y}
          width={CELL_SIZE}
          height={CELL_SIZE}
          rx={CELL_RADIUS}
          opacity={pixel.targetOpacity}
        />
      ))}
    </svg>
  )
}

type HomeLogoProps = {
  className?: string
}

export function HomeLogo({ className }: HomeLogoProps) {
  return (
    <div
      role="img"
      aria-label="moi"
      className={cn('flex items-center gap-2 text-accent', className)}
    >
      {GLYPHS.map((geometry, index) => (
        <HomeLogoGlyph key={index} geometry={geometry} />
      ))}
    </div>
  )
}
