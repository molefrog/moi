import { useState } from 'react'

import { cn } from '@/client/lib/cn'

import { LedLogo, type LedMode } from './LedLogo'

const MODES: { value: LedMode; label: string }[] = [
  { value: 'moi', label: 'MOI' },
  { value: 'moi2', label: 'MOI 2' },
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
  const [mode, setMode] = useState<LedMode>('moi')

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center gap-8 bg-[#f2f1ee]">
      <span className="absolute left-5 top-5 text-[11px] font-medium uppercase tracking-widest text-black/30">
        Playground
      </span>

      <LedLogo mode={mode} pixelSize={3} gap={1} />

      <Segmented options={MODES} value={mode} onChange={setMode} />
    </div>
  )
}
