import { Blobatar } from '@blobatar/react'
import type { Animate, Palette } from 'blobatar'

import { cn } from '@/client/lib/cn'
import { AGENT_THEMES, DEFAULT_WORKSPACE_THEME } from '@/lib/themes'
import type { AgentTheme } from '@/lib/types'

const AGENT_BLOBATAR_SEED = 'moi-agent'

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
  size: number
  preset?: AgentTheme
  animate?: Animate
  color?: AgentBlobatarColor
  className?: string
  'data-icon'?: 'inline-start' | 'inline-end'
}

function AgentBlobatar({
  size,
  preset = DEFAULT_WORKSPACE_THEME.agent,
  animate = 'hover',
  color = 'default',
  className,
  ...props
}: AgentBlobatarProps) {
  return (
    <Blobatar
      name={AGENT_BLOBATAR_SEED}
      size={size}
      animate={animate}
      palette={AGENT_PALETTES[color]}
      className={cn('shrink-0', className)}
      traits={{ shape: AGENT_THEMES[preset].shape }}
      {...props}
    />
  )
}

export { AgentBlobatar }
