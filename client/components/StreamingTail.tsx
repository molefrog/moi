// The live "tail" rendered below the finalized transcript while a turn is in
// flight: either the streaming preview of the assistant's current message
// (token-by-token) or, before the first token, the pulsing "Thinking" dots.
//
// This reads the EPHEMERAL preview store, never the durable transcript. It
// renders the preview through the SAME <TurnParts> path a finalized turn uses,
// so a streamed message and its finalized form look identical (seamless swap on
// finalize) — reasoning folds into a timeline group whose live "Thinking" row is
// expanded, and text stands alone. The preview is a full cumulative snapshot per
// frame, so a dropped/reordered frame just renders the next snapshot — it can
// never desync. The instant the real turn lands, the connection layer clears the
// preview (keyed by message id) and <TurnView> takes over in the same commit.
//
// Split into a store-connected shell (<StreamingTail>) and a pure, prop-driven
// view (<StreamingTailView>) so the display is unit-testable without the store.
import { useMemo } from 'react'

import { ThinkingIndicator, TurnParts } from '@/client/components/TurnView'
import { useWorkspaceId } from '@/client/lib/WorkspaceContext'
import { type LivePreview, selectPreviews, useLive } from '@/client/store/live'
import type { Part, PreviewBlock } from '@/lib/types'

// Map preview blocks to display parts, dropping not-yet-visible (empty) blocks so
// a just-opened block doesn't prematurely collapse the live thinking. Order is
// preserved, so reasoning-before-text folds/collapses the same as a real turn.
export function previewBlocksToParts(blocks: PreviewBlock[]): Part[] {
  return blocks
    .filter(b => b.text.length > 0)
    .map(b =>
      b.kind === 'reasoning' ? { type: 'reasoning', text: b.text } : { type: 'text', text: b.text }
    )
}

type StreamingTailProps = { processing: boolean }

export function StreamingTail({ processing }: StreamingTailProps) {
  const workspaceId = useWorkspaceId()
  const sessionId = useLive(s => s.activeByWorkspace[workspaceId] ?? null)
  // Select the stable `previews` slice, then derive in a memo — never return a
  // fresh object from the selector (zustand v5 would loop on it).
  const previews = useLive(s => s.previews)
  const root = useMemo(
    () => selectPreviews(previews, workspaceId, sessionId).root,
    [previews, workspaceId, sessionId]
  )
  return <StreamingTailView root={root} processing={processing} />
}

type StreamingTailViewProps = { root: LivePreview | null; processing: boolean }

export function StreamingTailView({ root, processing }: StreamingTailViewProps) {
  const parts = useMemo<Part[]>(() => previewBlocksToParts(root?.blocks ?? []), [root])

  // No visible tokens yet → the pulsing dots (only while actually processing).
  if (parts.length === 0) return processing ? <ThinkingIndicator /> : null

  // `processing` flows into the last run, so a trailing reasoning renders as a
  // live, expanded "Thinking" row that collapses once text/tools follow it.
  return <TurnParts parts={parts} cwd={null} processing={processing} />
}
