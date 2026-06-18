import { join } from 'path'

// The Scratchpad is a shared tldraw canvas per workspace. The browser is the
// only writer to disk — it autosaves a tldraw *document* snapshot here (the
// per-tab `session` is intentionally dropped). The server is a relay + store:
// it serves this file for hydration and parses it for `moi scratch read`, but
// never reconstructs tldraw shapes itself. See docs/moi-scratchpad.md.

// A tldraw document snapshot: `getSnapshot(store).document`. Opaque to us apart
// from `.store` (the record map) which `read` walks. `null` means empty canvas.
export type ScratchpadDoc = { store?: Record<string, unknown>; schema?: unknown }
export type ScratchpadSnapshot = { document: ScratchpadDoc | null }

// One shape as surfaced by `moi scratch read` — a compact, agent-friendly view.
export type ScratchShape = {
  id: string
  type: string
  x: number
  y: number
  w?: number
  h?: number
  text?: string
}

export function getScratchpadPath(workspacePath: string): string {
  return join(workspacePath, '.moi', 'scratchpad.json')
}

export async function loadScratchpadDoc(workspacePath: string): Promise<ScratchpadSnapshot> {
  try {
    const text = await Bun.file(getScratchpadPath(workspacePath)).text()
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === 'object' && parsed.document) {
      return { document: parsed.document as ScratchpadDoc }
    }
  } catch {}
  return { document: null }
}

export async function saveScratchpadDoc(
  document: ScratchpadDoc,
  workspacePath: string
): Promise<void> {
  await Bun.write(getScratchpadPath(workspacePath), JSON.stringify({ document }, null, 2))
}

// Pull readable text out of a shape's props. tldraw stores labels as `richText`
// (a ProseMirror-style doc) on most shapes; older/simple shapes may use a flat
// `text` string. Best-effort — never throw on an unexpected shape.
function extractText(props: unknown): string | undefined {
  if (!props || typeof props !== 'object') return undefined
  const p = props as { text?: unknown; richText?: unknown }
  if (typeof p.text === 'string' && p.text.length > 0) return p.text
  if (p.richText) {
    const out: string[] = []
    const walk = (node: unknown) => {
      if (!node || typeof node !== 'object') return
      const n = node as { type?: string; text?: unknown; content?: unknown }
      if (n.type === 'text' && typeof n.text === 'string') out.push(n.text)
      if (Array.isArray(n.content)) n.content.forEach(walk)
    }
    walk(p.richText)
    const joined = out.join('').trim()
    if (joined.length > 0) return joined
  }
  return undefined
}

// Parse the saved snapshot into a flat shape listing — served straight off disk,
// no browser needed. Ids are reported without tldraw's `shape:` prefix so they
// round-trip with `createShapeId(name)` on the draw side.
export async function readScratchpadShapes(workspacePath: string): Promise<ScratchShape[]> {
  const { document } = await loadScratchpadDoc(workspacePath)
  const store = document?.store
  if (!store || typeof store !== 'object') return []

  const shapes: ScratchShape[] = []
  for (const record of Object.values(store)) {
    if (!record || typeof record !== 'object') continue
    const r = record as {
      typeName?: string
      id?: string
      type?: string
      x?: number
      y?: number
      props?: { w?: unknown; h?: unknown }
    }
    if (r.typeName !== 'shape') continue
    const w = typeof r.props?.w === 'number' ? r.props.w : undefined
    const h = typeof r.props?.h === 'number' ? r.props.h : undefined
    shapes.push({
      id: (r.id ?? '').replace(/^shape:/, ''),
      type: r.type ?? 'unknown',
      x: typeof r.x === 'number' ? r.x : 0,
      y: typeof r.y === 'number' ? r.y : 0,
      ...(w !== undefined ? { w } : {}),
      ...(h !== undefined ? { h } : {}),
      ...(() => {
        const text = extractText(r.props)
        return text !== undefined ? { text } : {}
      })()
    })
  }
  return shapes
}
