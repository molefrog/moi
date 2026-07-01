// The live "tail" rendered below the finalized transcript while a turn is in
// flight: either the streaming preview of the assistant's current message
// (token-by-token) or, before the first token, the pulsing "Thinking" dots.
//
// This reads the EPHEMERAL preview store, never the durable transcript. The
// preview is a full cumulative snapshot per frame, so a dropped/reordered frame
// just renders the next snapshot — it can never desync. The instant the real
// turn lands, the connection layer clears the preview (keyed by message id) and
// the finalized <TurnView> takes over in the same commit, so there's no flicker
// and no double render.
import { useMemo } from 'react'

import { MarkdownContent } from '@/client/components/MarkdownContent'
import { ThinkingIndicator } from '@/client/components/TurnView'
import { useWorkspaceId } from '@/client/lib/WorkspaceContext'
import { selectPreviews, useLive } from '@/client/store/live'
import type { PreviewBlock } from '@/lib/types'

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

  const blocks = root?.blocks ?? []
  const hasVisibleText = blocks.some(b => b.text.length > 0)

  // No visible tokens yet → the pulsing dots (only while actually processing).
  if (!hasVisibleText) return processing ? <ThinkingIndicator /> : null

  return (
    <div className="flex flex-col gap-2">
      {blocks.map(b => (b.text.length > 0 ? <PreviewBlockView key={b.index} block={b} /> : null))}
    </div>
  )
}

type PreviewBlockViewProps = { block: PreviewBlock }

// One open content block. Text renders as Markdown (matching the finalized turn,
// so the swap on finalize is visually seamless); reasoning renders as muted
// prose under a "Thinking" label, mirroring the timeline's reasoning row.
function PreviewBlockView({ block }: PreviewBlockViewProps) {
  if (block.kind === 'reasoning') {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">Thinking</span>
        <div className="pr-2 text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
          {block.text}
        </div>
      </div>
    )
  }
  return <MarkdownContent content={block.text} />
}
