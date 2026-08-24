import { useMemo, useState } from 'react'

import { Blobatar } from '@blobatar/react'
import { IconCopy } from '@tabler/icons-react'
import { traits as createTraits } from 'blobatar'
import type { Palette, TraitOverrides } from 'blobatar'
import { Link } from 'wouter'

import { Button } from '@/client/components/ui/button'
import { Input } from '@/client/components/ui/input'
import { Slider } from '@/client/components/ui/slider'

const AGENT_SEED = 'moi-agent'

const AGENT_PALETTE = {
  head: 'var(--primary)',
  eye: 'var(--primary-foreground)'
} satisfies Palette

// Static Blobatars render as images, where app CSS variables are unavailable.
const STATIC_AGENT_PALETTE = {
  head: '#171717',
  eye: '#fafafa'
} satisfies Palette

const SHAPE_FAMILIES = [
  { name: 'round', value: 0.11, from: 0, to: 0.22 },
  { name: 'organic', value: 0.35, from: 0.22, to: 0.48 },
  { name: 'boxy', value: 0.54, from: 0.48, to: 0.6 },
  { name: 'capsule', value: 0.65, from: 0.6, to: 0.7 },
  { name: 'nub', value: 0.745, from: 0.7, to: 0.79 },
  { name: 'cloud', value: 0.825, from: 0.79, to: 0.86 },
  { name: 'droplet', value: 0.887, from: 0.86, to: 0.915 },
  { name: 'hexagon', value: 0.932, from: 0.915, to: 0.95 },
  { name: 'sun', value: 0.965, from: 0.95, to: 0.98 },
  { name: 'triangle', value: 0.99, from: 0.98, to: 1 }
] as const

type ShapeFamily = (typeof SHAPE_FAMILIES)[number]
type ShapeName = ShapeFamily['name']

type TraitControl = {
  key: string
  label: string
  range: string
}

const BASE_TRAITS: readonly TraitControl[] = [
  { key: 'body.r', label: 'Body size', range: '31–38 px before family scaling' },
  { key: 'body.ratio', label: 'Aspect ratio', range: '0.92–1.08× height' }
]

const ORGANIC_TRAITS: readonly TraitControl[] = [
  { key: 'body.pts', label: 'Outline points', range: '6–8 points' },
  ...Array.from({ length: 8 }, (_, index) => ({
    key: `body.r${index}`,
    label: `Point ${index + 1} radius`,
    range: '0.84–1.16× radius'
  }))
]

const FAMILY_TRAITS = {
  round: [{ key: 'body.n', label: 'Roundness', range: '1.9–2.5 superellipse' }],
  organic: ORGANIC_TRAITS,
  boxy: [
    { key: 'body.n', label: 'Boxiness', range: '3.4–6 superellipse' },
    { key: 'body.rot', label: 'Rotation', range: '−20–20°' }
  ],
  capsule: [{ key: 'capsule.squat', label: 'Squat', range: '0.55–0.68× height' }],
  nub: [
    { key: 'body.n', label: 'Roundness', range: '1.9–2.5 superellipse' },
    { key: 'nub.n', label: 'Nub count', range: '1–2 nubs' },
    { key: 'nub.a0', label: 'Nub 1 angle', range: '0–360°' },
    { key: 'nub.r0', label: 'Nub 1 size', range: '0.24–0.4× radius' },
    { key: 'nub.a1', label: 'Nub 2 angle', range: '0–360°' },
    { key: 'nub.r1', label: 'Nub 2 size', range: '0.24–0.4× radius' }
  ],
  cloud: [
    ...ORGANIC_TRAITS,
    { key: 'cloud.n', label: 'Lobe count', range: '4–6 lobes' },
    ...Array.from({ length: 6 }, (_, index) => ({
      key: `cloud.r${index}`,
      label: `Lobe ${index + 1} size`,
      range: '0.44–0.62× radius'
    }))
  ],
  droplet: [{ key: 'droplet.tip', label: 'Tip length', range: '1.4–1.65× radius' }],
  hexagon: [
    { key: 'body.rot', label: 'Rotation', range: '−12–12°' },
    { key: 'poly.round', label: 'Corner roundness', range: '0.24–0.5' }
  ],
  sun: [
    { key: 'body.n', label: 'Center roundness', range: '1.9–2.5 superellipse' },
    { key: 'sun.n', label: 'Ray count', range: '6–9 rays' },
    { key: 'sun.dist', label: 'Ray distance', range: '1–1.08× radius' },
    { key: 'sun.r', label: 'Ray size', range: '0.2–0.26× radius' },
    { key: 'sun.rot', label: 'Ray rotation', range: '0–360°' }
  ],
  triangle: [
    { key: 'body.rot', label: 'Rotation', range: '−5–5°' },
    { key: 'poly.round', label: 'Corner roundness', range: '0.24–0.5' }
  ]
} satisfies Record<ShapeName, readonly TraitControl[]>

function clampTrait(value: number): number {
  return Math.min(0.999, Math.max(0, Math.round(value * 1000) / 1000))
}

function formatTrait(value: number): string {
  return value.toFixed(3)
}

function singleSliderValue(value: number | readonly number[]): number {
  return typeof value === 'number' ? value : (value[0] ?? 0)
}

type ShapePreviewProps = {
  animated?: boolean
  geometry?: TraitOverrides
  seed: string
  size: number
  shape: number
}

function ShapePreview({ animated = false, geometry, seed, size, shape }: ShapePreviewProps) {
  return (
    <Blobatar
      name={seed}
      size={size}
      animate={animated ? 'hover' : undefined}
      palette={animated ? AGENT_PALETTE : STATIC_AGENT_PALETTE}
      traits={{ ...geometry, shape }}
    />
  )
}

type TraitSliderProps = {
  control: TraitControl
  overridden: boolean
  value: number
  onChange: (value: number) => void
}

function TraitSlider({ control, overridden, value, onChange }: TraitSliderProps) {
  const inputId = `trait-${control.key.replaceAll('.', '-')}`

  return (
    <div className="grid gap-2 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={inputId} className="text-sm font-medium">
          {control.label}
        </label>
        <Input
          id={inputId}
          type="number"
          min={0}
          max={0.999}
          step={0.001}
          value={formatTrait(value)}
          onChange={event => {
            const next = event.currentTarget.valueAsNumber
            if (!Number.isNaN(next)) onChange(clampTrait(next))
          }}
          className="w-24 font-mono tabular-nums"
        />
      </div>
      <Slider
        aria-label={control.label}
        min={0}
        max={0.999}
        step={0.001}
        value={[value]}
        onValueChange={next => onChange(clampTrait(singleSliderValue(next)))}
      />
      <span className="text-xs text-muted-foreground">
        {control.range}
        {overridden && ' · overridden'}
      </span>
    </div>
  )
}

export function BlobatarShapesPage() {
  const [seed, setSeed] = useState(AGENT_SEED)
  const [shapeName, setShapeName] = useState<ShapeName>('boxy')
  const [geometry, setGeometry] = useState<Record<string, number>>({})
  const seededTraits = useMemo(() => createTraits(seed), [seed])
  const family = SHAPE_FAMILIES.find(candidate => candidate.name === shapeName) ?? SHAPE_FAMILIES[2]
  const shape = family.value
  const familyControls = FAMILY_TRAITS[family.name]
  const activeKeys = new Set([...BASE_TRAITS, ...familyControls].map(control => control.key))
  const activeGeometry = Object.fromEntries(
    Object.entries(geometry).filter(([key]) => activeKeys.has(key))
  )
  const configText = JSON.stringify(
    {
      name: seed,
      traits: { shape, ...activeGeometry }
    },
    null,
    2
  )

  const traitValue = (key: string) => geometry[key] ?? seededTraits(key)
  const setTrait = (key: string, value: number) => {
    setGeometry(current => ({ ...current, [key]: value }))
  }

  return (
    <main className="mx-auto w-full max-w-[96rem] px-6 py-10">
      <Link href="/dev" className="text-sm text-muted-foreground hover:text-foreground">
        ← Dev pages
      </Link>

      <header className="mt-5 max-w-3xl">
        <p className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
          Playground
        </p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight">Blobatar shape builder</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Blobatar has 10 silhouette families. The seed generates every geometry trait you leave
          alone, which is why different names produce so many variations. Pick a family and tune its
          normalized 0–1 traits here.
        </p>
      </header>

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
          <section className="flex flex-col gap-5 rounded-xl bg-card p-5 shadow-sm">
            <div className="flex min-h-64 items-center justify-center rounded-xl bg-accent">
              <ShapePreview
                animated
                geometry={activeGeometry}
                seed={seed}
                shape={shape}
                size={208}
              />
            </div>

            <div>
              <p className="text-sm text-muted-foreground">Selected family</p>
              <div className="mt-1 flex items-baseline justify-between gap-3">
                <p className="text-lg font-medium capitalize">{family.name}</p>
                <p className="font-mono text-sm tabular-nums">shape: {formatTrait(shape)}</p>
              </div>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {formatTrait(family.from)}–&lt;{formatTrait(family.to)}
              </p>
            </div>

            <label className="grid gap-2 text-sm">
              <span>Variant seed</span>
              <Input value={seed} onChange={event => setSeed(event.currentTarget.value)} />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <Button type="button" onClick={() => void navigator.clipboard.writeText(configText)}>
                <IconCopy data-icon="inline-start" stroke={1.5} />
                Copy config
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={Object.keys(geometry).length === 0}
                onClick={() => setGeometry({})}
              >
                Reset traits
              </Button>
            </div>

            <pre className="max-h-48 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs leading-5">
              {configText}
            </pre>
          </section>
        </aside>

        <div className="flex min-w-0 flex-col gap-6">
          <section className="rounded-xl bg-card p-5 shadow-sm">
            <h2 className="text-lg font-medium">Shape family</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Values within one family band select the same silhouette. These are stable
              representative values for each family.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {SHAPE_FAMILIES.map(candidate => (
                <Button
                  key={candidate.name}
                  type="button"
                  variant={shapeName === candidate.name ? 'secondary' : 'outline'}
                  aria-pressed={shapeName === candidate.name}
                  onClick={() => setShapeName(candidate.name)}
                  className="h-auto flex-col gap-2 py-3"
                >
                  <ShapePreview geometry={geometry} seed={seed} shape={candidate.value} size={48} />
                  <span className="capitalize">{candidate.name}</span>
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">
                    {formatTrait(candidate.value)}
                  </span>
                </Button>
              ))}
            </div>
          </section>

          <section className="rounded-xl bg-card p-5 shadow-sm">
            <h2 className="text-lg font-medium">Base geometry</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Sliders start at values generated by the seed. Moving one creates an explicit trait
              override.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {BASE_TRAITS.map(control => (
                <TraitSlider
                  key={control.key}
                  control={control}
                  value={traitValue(control.key)}
                  overridden={geometry[control.key] !== undefined}
                  onChange={value => setTrait(control.key, value)}
                />
              ))}
            </div>
          </section>

          <section className="rounded-xl bg-card p-5 shadow-sm">
            <h2 className="text-lg font-medium capitalize">{family.name} geometry</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              These controls only affect the selected family.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {familyControls.map(control => (
                <TraitSlider
                  key={control.key}
                  control={control}
                  value={traitValue(control.key)}
                  overridden={geometry[control.key] !== undefined}
                  onChange={value => setTrait(control.key, value)}
                />
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
