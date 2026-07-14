import { useCallback, useRef, useState } from 'react'

import {
  type Editor,
  type TLAssetStore,
  type TLComponents,
  type TLEditorSnapshot,
  type TLUiOverrides,
  DefaultFillStyle,
  DefaultFontStyle,
  DefaultHorizontalAlignStyle,
  DefaultVerticalAlignStyle,
  Tldraw,
  getSnapshot,
  loadSnapshot
} from 'tldraw'
import 'tldraw/tldraw.css'

import { useWorkspaceId } from '@/client/features/workspace/WorkspaceContext'
import { setScratchExecutor } from '@/client/features/scratchpad/scratch-executor'
import { type WorkspaceEvent, useWorkspaceEvent } from '@/client/runtime/useWorkspaceEvents'
import type { ScratchOp, ScratchOpResult } from '@/lib/types'
import {
  type ScratchpadFetch,
  ScratchpadSkewNotice,
  detectScratchpadSkew,
  useScratchpadSnapshot
} from './useScratchpadSnapshot'
import { ScratchStyleBar, ScratchToolbar } from './ScratchpadControls'

// Identifies this tab's writes so it can ignore the `scratchpad:updated` echo of
// its own save (see the MEI reload below). Per page load.
const ORIGIN_ID = Math.random().toString(36).slice(2)

const AUTOSAVE_MS = 500

// tldraw license key, inlined at build time from the PUBLIC_TLDRAW_LICENSE_KEY
// env var (Bun's prefix-based env inlining — see bunfig.toml `[serve.static] env`
// for dev and scripts/build-client.ts for prod). The key is public by design
// (domain-scoped, ships in the client bundle). Empty/unset → undefined →
// tldraw's default unlicensed watermark. See docs/moi-scratchpad.md.
// Inlining requires the var to be set when the server process starts — the CLI
// launcher defaults it (server/cli.ts); a bare ref here throws in the browser.
const LICENSE_KEY = process.env.PUBLIC_TLDRAW_LICENSE_KEY || undefined

// Execute a relayed op in this tab. Only `view` is relayed now — rasterizing the
// canvas to a PNG needs the browser (`editor.toImageDataUrl`); every mutation runs
// server-side against the disk snapshot (see server/scratchpad-executor.ts), so a
// non-view op arriving here is unexpected.
function makeExecutor(editor: Editor) {
  return async (op: ScratchOp): Promise<ScratchOpResult> => {
    if (op.kind !== 'view') {
      throw new Error(`Scratchpad op "${op.kind}" runs on the server, not the browser.`)
    }
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

// File-backed assets: without this, tldraw inlines every pasted/dropped image as
// a base64 data URL inside the document — megabytes re-serialized into
// `.moi/.scratchpad.json` on every autosave and shipped over every GET/PUT.
// Instead `upload` POSTs the bytes once and stores a tiny `asset:<file>` src on
// the record; `resolve` maps it back to the serving URL at render time. Legacy
// snapshots still holding data URLs pass through `resolve` untouched (the
// server extracts them to files on the next save). See server/scratchpad-assets.ts.
function makeAssetStore(workspaceId: string): TLAssetStore {
  const base = `/api/workspaces/${workspaceId}/scratchpad/assets`
  return {
    async upload(_asset, file) {
      const res = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file
      })
      if (!res.ok) throw new Error(`Upload failed: ${await res.text()}`)
      const { src } = (await res.json()) as { src: string }
      return { src }
    },
    resolve(asset) {
      const src = asset.props.src
      if (src?.startsWith('asset:')) return `${base}/${src.slice('asset:'.length)}`
      return src
    }
  }
}

// --- Scratchpad UI shell --------------------------------------------------
// We replace tldraw's full UI with a curated subset (see docs/moi-scratchpad.md
// for the prioritization). Backbone v1: a custom vertical tool bar on the left,
// most menus dropped, pages disabled, export hard-removed, grid on. The default
// (contextual) style panel and zoom control are kept as-is for now; style
// trimming is a follow-up.

// Drop tldraw's built-in chrome we replace with custom overlays (tool bar, style
// bar). `null` removes a component entirely. NavigationPanel is kept — we like its
// native zoom control — but Minimap is nulled, which also strips its toggle button
// from the panel, leaving just the zoom menu. Kept on defaults: NavigationPanel
// (zoom), ContextMenu, KeyboardShortcutsDialog.
const SCRATCH_COMPONENTS: TLComponents = {
  Toolbar: null,
  StylePanel: null,
  Minimap: null,
  MainMenu: null,
  PageMenu: null,
  ActionsMenu: null,
  QuickActions: null,
  HelpMenu: null,
  DebugMenu: null
}

// Remove dropped tools (kills their shortcuts too) and hard-disable export/print.
// Deleting an unknown action id is a harmless no-op.
const SCRATCH_OVERRIDES: TLUiOverrides = {
  tools(_editor, tools) {
    delete tools.frame
    delete tools.laser
    return tools
  },
  actions(_editor, actions) {
    for (const id of ['export-as-svg', 'export-as-png', 'copy-as-svg', 'copy-as-png', 'print']) {
      delete actions[id]
    }
    return actions
  }
}

// One page only — disables the page selector and all multi-page UI.
const SCRATCH_OPTIONS = { maxPages: 1 }

// Browser drag/drop/paste limits (tldraw defaults: reject >10MB, no rescale). We
// accept larger drops and rescale big images to fit so a phone-sized photo lands
// as a lightweight asset instead of bloating the snapshot's sidecar files. The
// size check runs BEFORE the rescale, so a 32MB drop is admitted and then shrunk.
// (The agent's `moi scratch add image` path has its own presets — see the
// executor's IMAGE_PRESETS; this only governs what the browser accepts.)
const MAX_DROP_BYTES = 32 * 1024 * 1024
const MAX_IMAGE_DIMENSION = 2048

// The Scratchpad surface: a real tldraw editor, hydrated from and autosaved to
// `.moi/.scratchpad.json` via REST. One canvas shared by the user and the agent —
// the agent reaches it through `moi scratch` (relayed ops execute here). See
// docs/moi-scratchpad.md.
export function Scratchpad() {
  const workspaceId = useWorkspaceId()
  const editorRef = useRef<Editor | null>(null)
  // The whole scratchpad region (canvas + tool bar + style bar). Focus is driven
  // off whether a pointerdown lands inside this, so clicking a tool keeps the
  // editor focused — see the pointerdown handler in onMount.
  const rootRef = useRef<HTMLDivElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Set before a remote `loadSnapshot`; the autosave listener consumes it on the
  // first (throttled) flush so the load doesn't echo back out as a save. (Store
  // listeners fire on the next frame, not synchronously, so a timer-based clear
  // would race — consuming it in the listener is timing-independent.)
  const applyingRemote = useRef(false)
  // Reactive handle to the mounted editor, used to render the custom tool bar.
  const [editor, setEditor] = useState<Editor | null>(null)
  const { loaded, snapshot, skew, flagSkew } = useScratchpadSnapshot(workspaceId)
  // Stable identity per workspace, held in a ref rather than useMemo (which React
  // may discard): a fresh `assets` identity makes <Tldraw> rebuild its store and
  // remount the editor, dropping unsaved edits and resetting the camera.
  const assetStoreRef = useRef<{ id: string; store: TLAssetStore } | null>(null)
  if (assetStoreRef.current?.id !== workspaceId) {
    assetStoreRef.current = { id: workspaceId, store: makeAssetStore(workspaceId) }
  }
  const assetStore = assetStoreRef.current.store

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

  // A remote save (another tab, or an agent draw landing in another tab) — pull
  // the new snapshot and load it into the live store. Skip our own echo. The
  // fetched document is pre-flighted like the initial load: if the server was
  // swapped for a newer moi mid-session, `loadSnapshot` here would throw — flip
  // the skew notice instead (unmounting the editor, which also stops the
  // autosave timer) so this stale tab can't save over the newer file.
  useWorkspaceEvent((e: WorkspaceEvent) => {
    if (e.type !== 'scratchpad:updated' || e.workspaceId !== workspaceId) return
    if (e.origin && e.origin === ORIGIN_ID) return
    if (!editorRef.current) return
    fetch(`/api/workspaces/${workspaceId}/scratchpad`)
      .then(r => r.json())
      .then((d: ScratchpadFetch) => {
        const editor = editorRef.current
        if (!editor || !d?.document) return
        const found = detectScratchpadSkew(d.document, d.writer)
        if (found) {
          if (saveTimer.current) clearTimeout(saveTimer.current)
          flagSkew(found)
          return
        }
        applyingRemote.current = true
        loadSnapshot(editor.store, { document: d.document })
      })
      .catch(() => {})
  })

  const onMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor
      setEditor(editor)
      // Grid on by default (no toggle in the UI).
      editor.updateInstanceState({ isGridMode: true })
      // Locked defaults that have no UI control: hand-drawn font, centered text.
      editor.run(() => {
        editor.setStyleForNextShapes(DefaultFontStyle, 'draw')
        editor.setStyleForNextShapes(DefaultHorizontalAlignStyle, 'middle')
        editor.setStyleForNextShapes(DefaultVerticalAlignStyle, 'middle')
        // Rectangles start solid-filled. Still user-adjustable via the style bar —
        // applyToolLocks deliberately never re-pins fill, so this is a default, not
        // a lock. ('fill' = the style bar's "Solid"; 'solid' there means "Semi".)
        editor.setStyleForNextShapes(DefaultFillStyle, 'fill')
      })
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
      setScratchExecutor(workspaceId, makeExecutor(editor))
      // Focus management: tldraw only fires keyboard shortcuts while the editor's
      // instance `isFocused` is set, but with `autoFocus={false}` it never flips
      // that on its own. We drive it from where the pointer lands — a pointerdown
      // inside the scratchpad (canvas, tool bar, or style bar, all under rootRef)
      // focuses the editor; one anywhere else (e.g. the chat) blurs it, so hotkeys
      // are live only when the scratchpad is the active surface. Guarded on the
      // current state so a click already inside (e.g. double-click to edit a
      // shape's text) doesn't re-focus the container and steal focus from the
      // text field. Capture phase so we see it regardless of downstream handlers.
      const onPointerDown = (e: PointerEvent) => {
        const target = e.target as Node | null
        const inside = !!target && !!rootRef.current?.contains(target)
        if (inside) {
          if (!editor.getIsFocused()) editor.focus()
        } else if (editor.getIsFocused()) {
          editor.blur()
        }
      }
      const doc = editor.getContainer().ownerDocument
      doc.addEventListener('pointerdown', onPointerDown, true)
      // First open: grab focus so the user can reach for the keyboard right away.
      // `focus()` both sets `isFocused` and DOM-focuses the canvas container, so it
      // becomes the active element — clearing tldraw's secondary guard that mutes
      // shortcuts while an input/textarea (e.g. the chat) holds focus.
      editor.focus()
      return () => {
        unlisten()
        doc.removeEventListener('pointerdown', onPointerDown, true)
        if (saveTimer.current) clearTimeout(saveTimer.current)
        setScratchExecutor(workspaceId, null)
        setEditor(null)
        editorRef.current = null
      }
    },
    [workspaceId, save]
  )

  if (!loaded) return <div className="min-h-0 flex-1 bg-muted/40" />
  if (skew) return <ScratchpadSkewNotice skew={skew} />

  return (
    <div ref={rootRef} className="relative min-h-0 flex-1 overflow-hidden">
      <div className="absolute inset-0">
        <Tldraw
          snapshot={snapshot}
          assets={assetStore}
          licenseKey={LICENSE_KEY}
          onMount={onMount}
          components={SCRATCH_COMPONENTS}
          overrides={SCRATCH_OVERRIDES}
          options={SCRATCH_OPTIONS}
          // Accept drops up to 32MB and rescale big images to fit (tldraw checks
          // the size before rescaling, so a large photo is admitted then shrunk).
          maxAssetSize={MAX_DROP_BYTES}
          maxImageDimension={MAX_IMAGE_DIMENSION}
          // Hand focus control entirely to us: tldraw's own `autoFocus` only seeds
          // the `isFocused` flag (hotkeys would fire window-wide, even from the
          // chat) without ever DOM-focusing the canvas. Instead onMount focuses
          // the editor on open and a pointerdown handler toggles it thereafter.
          autoFocus={false}
        />
      </div>
      {editor && <ScratchToolbar editor={editor} />}
      {editor && <ScratchStyleBar editor={editor} />}
    </div>
  )
}
