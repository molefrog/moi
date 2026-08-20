import { Blobatar } from '@blobatar/react'
import type { Animate, Palette } from 'blobatar'

import { cn } from '@/client/lib/cn'

type AgentBlobatarColor = 'primary' | 'default'

const AGENT_PALETTES = {
  default: {
    head: 'var(--foreground)',
    eye: 'var(--background)'
  },
  primary: {
    head: 'var(--primary)',
    eye: 'var(--primary-foreground)'
  }
} satisfies Record<AgentBlobatarColor, Palette>

type AgentBlobatarProps = {
  name: string
  size: number
  animate?: Animate
  color?: AgentBlobatarColor
  className?: string
  'data-icon'?: 'inline-start' | 'inline-end'
}

function AgentBlobatar({
  name,
  size,
  animate = 'hover',
  color = 'default',
  className,
  ...props
}: AgentBlobatarProps) {
  return (
    <Blobatar
      name={name}
      size={size}
      animate={animate}
      palette={AGENT_PALETTES[color]}
      className={cn('shrink-0', className)}
      {...props}
    />
  )
}

export { AgentBlobatar }
