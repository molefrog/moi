import {
  type Editor,
  type TLSessionStateSnapshot,
  createSessionStateSnapshotSignal,
  loadSessionStateSnapshotIntoStore,
  react
} from 'tldraw'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Camera/zoom and the rest of tldraw's session state are per-browser UI
// preferences — never written to `.moi/.scratchpad.json`, which holds only the
// shared document. They get their own persisted store (`moi:scratch-sessions`)
// rather than a slot in the `moi:ui` store: the blobs are tldraw's own
// versioned TLSessionStateSnapshot, migrated by tldraw on load, and saving one
// rewrites the whole persisted record — better to keep that churn off app prefs.
type ScratchSessionStore = {
  sessions: Record<string, TLSessionStateSnapshot>
  setSession: (workspaceId: string, session: TLSessionStateSnapshot) => void
  removeSession: (workspaceId: string) => void
}

export const useScratchSessionStore = create<ScratchSessionStore>()(
  persist(
    set => ({
      sessions: {},
      setSession: (workspaceId, session) =>
        set(state => ({ sessions: { ...state.sessions, [workspaceId]: session } })),
      removeSession: workspaceId =>
        set(state => {
          const sessions = { ...state.sessions }
          delete sessions[workspaceId]
          return { sessions }
        })
    }),
    { name: 'moi:scratch-sessions' }
  )
)

const SAVE_DEBOUNCE_MS = 500

// Restore this browser's saved session (camera, zoom, selection) into a mounted
// editor, then keep it saved as it changes. Call from onMount, after the store
// is hydrated from the server snapshot — loading the session then just moves
// the viewport. Returns a cleanup that stops the watcher. A corrupt or
// version-skewed snapshot is discarded and the editor keeps its default
// viewport.
export function persistScratchSession(editor: Editor, workspaceId: string): () => void {
  const { sessions, setSession, removeSession } = useScratchSessionStore.getState()
  const saved = sessions[workspaceId]
  if (saved) {
    try {
      loadSessionStateSnapshotIntoStore(editor.store, saved)
    } catch {
      removeSession(workspaceId)
    }
  }
  const signal = createSessionStateSnapshotSignal(editor.store)
  let timer: ReturnType<typeof setTimeout> | null = null
  const stop = react('save scratch session', () => {
    const session = signal.get()
    if (!session) return
    // Debounced: the signal updates on every camera tick while panning/zooming.
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => setSession(workspaceId, session), SAVE_DEBOUNCE_MS)
  })
  return () => {
    stop()
    if (timer) clearTimeout(timer)
  }
}
