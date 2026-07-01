// Turns the live streaming preview into a synthetic assistant Turn so it flows
// through the SAME groupTurns + rendering pipeline as finalized turns — instead
// of being rendered by a separate component that can't merge into the current
// group. A thinking-only preview folds into the ongoing tool group (matching how
// its finalized form groups); a preview with text stands alone as its own turn.
// The moment the real turn lands, the preview is cleared and the real turn takes
// its place in the same pipeline, so the swap is seamless.
import type { LivePreview } from '@/client/store/live'
import type { Part, PreviewBlock, Turn } from '@/lib/types'

// Stable id for the synthetic live turn — keeps React's key steady across deltas
// (when it stands alone; when it merges, the group keeps the prior turn's id).
export const LIVE_PREVIEW_TURN_ID = 'live-preview'

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

// Build the synthetic turn for the current root preview, or null when there's
// nothing visible yet (the caller shows the "Thinking" dots in that case).
export function buildPreviewTurn(root: LivePreview | null): Turn | null {
  const parts = previewBlocksToParts(root?.blocks ?? [])
  if (parts.length === 0) return null
  return {
    id: LIVE_PREVIEW_TURN_ID,
    role: 'assistant',
    origin: { kind: 'user-input' },
    parts
  }
}
