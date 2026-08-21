import { Blobatar } from '@blobatar/react'
import type { Expression, Palette } from 'blobatar'
import {
  happy,
  idle,
  love,
  mad,
  sad,
  scared,
  shy,
  sick,
  sleepy,
  smug,
  surprised,
  thinking,
  unsure,
  wink
} from 'blobatar/expression'

import { cn } from '@/client/lib/cn'
import { AGENT_THEMES, DEFAULT_WORKSPACE_THEME } from '@/lib/themes'
import type { AgentTheme } from '@/lib/types'

const AGENT_BLOBATAR_SEED = 'moi-agent'

type AgentBlobatarColor = 'primary' | 'secondary' | 'default'
export type AgentBlobatarExpression =
  | 'idle'
  | 'happy'
  | 'sad'
  | 'mad'
  | 'surprised'
  | 'wink'
  | 'sleepy'
  | 'smug'
  | 'unsure'
  | 'scared'
  | 'love'
  | 'shy'
  | 'sick'
  | 'thinking'

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
  idle,
  happy,
  sad,
  mad,
  surprised,
  wink,
  sleepy,
  smug,
  unsure,
  scared,
  love,
  shy,
  sick,
  thinking
} satisfies Record<AgentBlobatarExpression, Expression>

type AgentBlobatarProps = {
  size: number
  preset?: AgentTheme
  animated?: boolean
  color?: AgentBlobatarColor
  expression?: AgentBlobatarExpression
  className?: string
}

function AgentBlobatar({
  size,
  preset = DEFAULT_WORKSPACE_THEME.agent,
  animated = false,
  color = 'default',
  expression = 'idle',
  className
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
    />
  )
}

export { AgentBlobatar }
