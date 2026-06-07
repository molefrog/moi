import { useState } from 'react'

import { cn } from '@/client/lib/cn'

import { type Effect, LedLogo, type Sprite } from './LedLogo'
import { PixelPainter } from './PixelPainter'

const SPRITES: { value: Sprite; label: string }[] = [
  { value: 'moi', label: 'M' },
  { value: 'moi-full', label: 'MOI' }
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
    <div className="flex gap-1 rounded-lg bg-black/[0.04] p-1">
      {options.map(o => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-md px-3 py-1 text-xs transition-colors',
            value === o.value ? 'bg-neutral-900 text-white' : 'text-black/50 hover:text-black/80'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// Scratch route for UI experiments. Add new experiments here over time.
export function PlaygroundPage() {
  const [sprite, setSprite] = useState<Sprite>('moi')
  const [effect, setEffect] = useState<Effect | 'none'>('none')

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center gap-8 bg-[#f2f1ee]">
      <span className="absolute left-5 top-5 text-[11px] font-medium uppercase tracking-widest text-black/30">
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
