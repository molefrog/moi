import { useState } from 'react'

import { Button } from '@/client/components/ui/button'

import { type Effect, LedLogo, type Sprite } from '@/client/components/shared/LedLogo'
import { PixelPainter } from './PixelPainter'

const SPRITES: { value: Sprite; label: string }[] = [
  { value: 'moi', label: 'M' },
  { value: 'moi-full', label: 'moi' }
]

const EFFECTS: { value: Effect | 'none'; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'wave', label: 'Wave' },
  { value: 'chaos', label: 'Random' }
]

type SegmentedProps<T extends string | number> = {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}

function Segmented<T extends string | number>({ options, value, onChange }: SegmentedProps<T>) {
  return (
    <div className="flex gap-1 rounded-lg bg-accent p-1">
      {options.map(o => (
        <Button
          key={String(o.value)}
          type="button"
          variant={value === o.value ? 'default' : 'ghost'}
          size="sm"
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </Button>
      ))}
    </div>
  )
}

// Scratch route for UI experiments. Add new experiments here over time.
export function PlaygroundPage() {
  const [sprite, setSprite] = useState<Sprite>('moi')
  const [effect, setEffect] = useState<Effect | 'none'>('none')

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center gap-8 bg-muted">
      <span className="absolute top-5 left-5 text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
        Playground
      </span>

      <PixelPainter />

      <LedLogo
        sprite={sprite}
        effect={effect === 'none' ? undefined : effect}
        pixelSize={3}
        gap={0.5}
      />

      <div className="flex flex-col items-center gap-2">
        <Segmented options={SPRITES} value={sprite} onChange={setSprite} />
        <Segmented options={EFFECTS} value={effect} onChange={setEffect} />
      </div>
    </div>
  )
}
