// WorkspaceType → Harness lookup. This is the single import surface for the
// rest of the server: web.ts/api.ts/etc. dispatch through harnessFor()
// instead of branching on workspace.type (documented exceptions: cli.ts
// provisioning and tests import harness internals directly).
import type { WorkspaceEntry, WorkspaceType } from '@/lib/types'

import { claudeCodeHarness } from './claude-code'
import { codexHarness } from './codex'
import { openclawHarness } from './openclaw'
import type { Harness } from './types'

export type { Harness, HarnessCapabilities, SendMessageInput } from './types'

const harnesses = {
  'claude-code': claudeCodeHarness,
  openclaw: openclawHarness,
  codex: codexHarness
} satisfies Partial<Record<WorkspaceType, Harness>>

// An untyped registry entry is a Claude Code workspace (pre-typing legacy).
export function harnessFor(ws: Pick<WorkspaceEntry, 'type'> | WorkspaceType | undefined): Harness {
  const type = typeof ws === 'string' ? ws : ws?.type
  return (
    (type && type in harnesses && harnesses[type as keyof typeof harnesses]) || claudeCodeHarness
  )
}

export function allHarnesses(): Harness[] {
  return Object.values(harnesses)
}

// Is this string a workspace type moi can actually drive? (Validates the
// `type` field on workspace registration.)
export function isHarnessType(value: unknown): value is keyof typeof harnesses {
  return typeof value === 'string' && value in harnesses
}
