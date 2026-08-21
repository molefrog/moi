import { Blobatar } from '@blobatar/react'
import type { Expression, Palette } from 'blobatar'
import { thinking } from 'blobatar/expression'

import { cn } from '@/client/lib/cn'
import { AGENT_THEMES, DEFAULT_WORKSPACE_THEME } from '@/lib/themes'
import type { AgentTheme } from '@/lib/types'

const AGENT_BLOBATAR_SEED = 'moi-agent'

type AgentBlobatarColor = 'primary' | 'secondary' | 'default'
type AgentBlobatarExpression = 'thinking'

const AGENT_PALETTES = {
  default: {
    head: 'var(--foreground)',
    eye: 'var(--background)'
  },
  primary: {
    head: 'var(--primary)',
    eye: 'var(--primary-foreground)'
  },
  secondary: {
    head: 'var(--accent)',
    eye: 'var(--accent-foreground)'
  }
} satisfies Record<AgentBlobatarColor, Palette>

const AGENT_EXPRESSIONS = {
  thinking
} satisfies Record<AgentBlobatarExpression, Expression>

type AgentBlobatarProps = {
  size: number
  preset?: AgentTheme
  animated?: boolean
  color?: AgentBlobatarColor
  expression?: AgentBlobatarExpression
  className?: string
  'data-icon'?: 'inline-start' | 'inline-end'
}

function AgentBlobatar({
  size,
  preset = DEFAULT_WORKSPACE_THEME.agent,
  animated = false,
  color = 'default',
  expression,
  className,
  ...props
}: AgentBlobatarProps) {
  return (
    <Blobatar
      name={AGENT_BLOBATAR_SEED}
      size={size}
      animate={animated ? 'always' : 'hover'}
      palette={AGENT_PALETTES[color]}
      expression={expression ? AGENT_EXPRESSIONS[expression] : undefined}
      className={cn('shrink-0', className)}
      traits={{ shape: AGENT_THEMES[preset].shape }}
      {...props}
    />
  )
}

export { AgentBlobatar }
