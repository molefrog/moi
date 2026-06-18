import { useCallback, useEffect, useRef, useState } from 'react'

import {
  type Editor,
  type TLEditorSnapshot,
  Tldraw,
  createShapeId,
  getSnapshot,
  loadSnapshot,
  toRichText
} from 'tldraw'
import 'tldraw/tldraw.css'

import { useWorkspaceId } from '@/client/lib/WorkspaceContext'
import { setScratchExecutor } from '@/client/lib/scratch-executor'
import { type MeiEvent, useMeiEvent } from '@/client/hooks/useMeiEvents'
import type { ScratchOp, ScratchOpResult } from '@/lib/types'

// Identifies this tab's writes so it can ignore the `scratchpad:updated` echo of
// its own save (see the MEI reload below). Per page load.
const ORIGIN_ID = Math.random().toString(36).slice(2)

const AUTOSAVE_MS = 500

// Map a relayed op onto the tldraw Editor API. Shape names → deterministic ids
// via createShapeId, so the same op run in two tabs converges. After any
// mutation we flush an immediate save so a following `moi scratch read` (served
// off disk) is consistent. Returns the shape name (add), a PNG data URL (view),
// or a bare ack.
function makeExecutor(editor: Editor, flushSave: () => void) {
  return async (op: ScratchOp): Promise<ScratchOpResult> => {
    switch (op.kind) {
      case 'add-rect': {
        editor.createShape({
          id: createShapeId(op.name),
          type: 'geo',
          x: op.x,
          y: op.y,
          props: {
            geo: 'rectangle',
            w: op.w,
            h: op.h,
            ...(op.text ? { richText: toRichText(op.text) } : {})
          }
        })
        flushSave()
        return { name: op.name }
      }
      case 'add-text': {
        editor.createShape({
          id: createShapeId(op.name),
          type: 'text',
          x: op.x,
          y: op.y,
          props: { richText: toRichText(op.text) }
        })
        flushSave()
        return { name: op.name }
      }
      case 'add-note': {
        editor.createShape({
          id: createShapeId(op.name),
          type: 'note',
          x: op.x,
          y: op.y,
          props: { richText: toRichText(op.text) }
        })
        flushSave()
        return { name: op.name }
      }
      case 'add-arrow': {
        const id = createShapeId(op.name)
        // Arrow at the canvas origin: point endpoints carry absolute coords;
        // bound endpoints get placeholders that the binding then drives.
        editor.createShape({
          id,
          type: 'arrow',
          x: 0,
          y: 0,
          props: {
            start: 'name' in op.from ? { x: 0, y: 0 } : { x: op.from.x, y: op.from.y },
            end: 'name' in op.to ? { x: 100, y: 0 } : { x: op.to.x, y: op.to.y }
          }
        })
        const bind = (end: { name: string }, terminal: 'start' | 'end') =>
          editor.createBinding({
            type: 'arrow',
            fromId: id,
            toId: createShapeId(end.name),
            props: {
              terminal,
              normalizedAnchor: { x: 0.5, y: 0.5 },
              isPrecise: false,
              isExact: false,
              snap: 'none'
            }
          })
        if ('name' in op.from) bind(op.from, 'start')
        if ('name' in op.to) bind(op.to, 'end')
        flushSave()
        return { name: op.name }
      }
      case 'move': {
        const shape = editor.getShape(createShapeId(op.name))
        if (!shape) throw new Error(`No shape named "${op.name}"`)
        editor.updateShape({ id: shape.id, type: shape.type, x: op.x, y: op.y })
        flushSave()
        return { ok: true }
      }
      case 'set': {
        const shape = editor.getShape(createShapeId(op.name))
        if (!shape) throw new Error(`No shape named "${op.name}"`)
        editor.updateShape({
          id: shape.id,
          type: shape.type,
          props: { richText: toRichText(op.text) }
        })
        flushSave()
        return { ok: true }
      }
      case 'delete': {
        editor.deleteShape(createShapeId(op.name))
        flushSave()
        return { ok: true }
      }
      case 'view': {
        const ids = [...editor.getCurrentPageShapeIds()]
        if (ids.length === 0) throw new Error('Canvas is empty — nothing to view.')
        const { url } = await editor.toImageDataUrl(ids, {
          format: 'png',
          background: true,
          padding: 32
        })
        return { image: url }
      }
    }
  }
}

// The Scratchpad surface: a real tldraw editor, hydrated from and autosaved to
// `.moi/scratchpad.json` via REST. One canvas shared by the user and the agent —
// the agent reaches it through `moi scratch` (relayed ops execute here). See
// docs/moi-scratchpad.md.
export function Scratchpad() {
  const workspaceId = useWorkspaceId()
  const editorRef = useRef<Editor | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Set before a remote `loadSnapshot`; the autosave listener consumes it on the
  // first (throttled) flush so the load doesn't echo back out as a save. (Store
  // listeners fire on the next frame, not synchronously, so a timer-based clear
  // would race — consuming it in the listener is timing-independent.)
  const applyingRemote = useRef(false)
  const [loaded, setLoaded] = useState(false)
  const initialSnapshot = useRef<Partial<TLEditorSnapshot> | undefined>(undefined)

  const save = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    let document: TLEditorSnapshot['document']
    try {
      document = getSnapshot(editor.store).document
    } catch {
      return
    }
    void fetch(`/api/workspaces/${workspaceId}/scratchpad`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document, origin: ORIGIN_ID })
    }).catch(() => {})
  }, [workspaceId])

  const flushSave = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    save()
  }, [save])

  // Hydrate once per workspace. `document: null` → start with an empty canvas.
  useEffect(() => {
    let cancelled = false
    setLoaded(false)
    initialSnapshot.current = undefined
    fetch(`/api/workspaces/${workspaceId}/scratchpad`)
      .then(r => r.json())
      .then((d: { document: TLEditorSnapshot['document'] | null }) => {
        if (cancelled) return
        if (d?.document) initialSnapshot.current = { document: d.document }
        setLoaded(true)
      })
      .catch(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [workspaceId])

  // A remote save (another tab, or an agent draw landing in another tab) — pull
  // the new snapshot and load it into the live store. Skip our own echo.
  useMeiEvent((e: MeiEvent) => {
    if (e.type !== 'scratchpad:updated' || e.workspaceId !== workspaceId) return
    if (e.origin && e.origin === ORIGIN_ID) return
    if (!editorRef.current) return
    fetch(`/api/workspaces/${workspaceId}/scratchpad`)
      .then(r => r.json())
      .then((d: { document: TLEditorSnapshot['document'] | null }) => {
        const editor = editorRef.current
        if (!editor || !d?.document) return
        applyingRemote.current = true
        loadSnapshot(editor.store, { document: d.document })
      })
      .catch(() => {})
  })

  const onMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor
      const unlisten = editor.store.listen(
        () => {
          if (applyingRemote.current) {
            applyingRemote.current = false
            return
          }
          if (saveTimer.current) clearTimeout(saveTimer.current)
          saveTimer.current = setTimeout(save, AUTOSAVE_MS)
        },
        { source: 'user', scope: 'document' }
      )
      setScratchExecutor(workspaceId, makeExecutor(editor, flushSave))
      return () => {
        unlisten()
        if (saveTimer.current) clearTimeout(saveTimer.current)
        setScratchExecutor(workspaceId, null)
        editorRef.current = null
      }
    },
    [workspaceId, save, flushSave]
  )

  if (!loaded) return <div className="min-h-0 flex-1 bg-muted/40" />

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <div className="absolute inset-0">
        <Tldraw snapshot={initialSnapshot.current} onMount={onMount} />
      </div>
    </div>
  )
}
