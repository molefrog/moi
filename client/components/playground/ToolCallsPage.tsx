import { useState } from 'react'

import { cn } from '@/client/lib/cn'
import {
  FIXTURE_CWD,
  liveToolCalls,
  multipleToolCalls,
  singleToolCall,
  subagentDoneTrace,
  subagentTrace,
  ToolCallGroup
} from '@/client/components/tool-group'

const VARIANTS = [
  { value: 'single', label: 'Single' },
  { value: 'multiple', label: 'Multiple' },
  { value: 'live', label: 'Live' },
  { value: 'subagent', label: 'Subagent' },
  { value: 'subagent-done', label: 'Subagent done' }
] as const

type Variant = (typeof VARIANTS)[number]['value']

type SegmentedProps = {
  value: Variant
  onChange: (value: Variant) => void
}

function Segmented({ value, onChange }: SegmentedProps) {
  return (
    <div className="flex gap-1 rounded-lg bg-black/[0.04] p-1">
      {VARIANTS.map(o => (
        <button
          key={o.value}
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

// Scratch route for iterating on <ToolCallGroup> in isolation. Renders the
// group inside a chat-width card so it reads like the real transcript.
const FIXTURES: Record<Variant, typeof singleToolCall> = {
  single: singleToolCall,
  multiple: multipleToolCalls,
  live: liveToolCalls,
  subagent: subagentTrace,
  'subagent-done': subagentDoneTrace
}

export function ToolCallsPage() {
  const [variant, setVariant] = useState<Variant>('multiple')

  return (
    <div className="flex min-h-dvh flex-col items-center gap-6 bg-[#f2f1ee] px-4 py-16">
      <span className="text-[11px] font-medium tracking-widest text-black/30 uppercase">
        Playground / Tool calls
      </span>

      <Segmented value={variant} onChange={setVariant} />

      <div className="w-full max-w-[var(--column-w)] rounded-xl border border-border bg-background p-5 font-sans text-foreground shadow-sm">
        {/* `processing` only matters for the live variant — it turns the trailing
            reasoning into "Thinking" and shows the live running tool spinning. */}
        <ToolCallGroup
          parts={FIXTURES[variant]}
          cwd={FIXTURE_CWD}
          processing={variant === 'live'}
        />
      </div>
    </div>
  )
}
