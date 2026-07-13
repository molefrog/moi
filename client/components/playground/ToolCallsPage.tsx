import { useState } from 'react'

import { Button } from '@/client/components/ui/button'
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
    <div className="flex gap-1 rounded-lg bg-accent p-1">
      {VARIANTS.map(o => (
        <Button
          key={o.value}
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
    <div className="flex min-h-dvh flex-col items-center gap-6 bg-muted px-4 py-16">
      <span className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
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
