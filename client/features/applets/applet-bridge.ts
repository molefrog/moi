import { useEffect, useRef } from 'react'

import type { MoiAppletRuntime } from '@/lib/types'

// The `window.moi` bridge — the host side of the applet `moi` module. Bundles
// compile `focusTab(...)` down to `window.moi?.focusTab(...)` (see
// server/bundler/build-applet.ts), so outside the moi host the calls no-op.
declare global {
  interface Window {
    moi?: MoiAppletRuntime
  }
}

// Install the bridge for the lifetime of the mounting component (the workspace
// screen, so the bridge always targets the workspace on screen). The installed
// object is a stable shell reading the latest `runtime` through a ref — so
// StrictMode's double-mount and workspace switches can interleave
// install/remove without ever leaving a stale closure (or no bridge) behind:
// each mount owns its shell and only removes its own.
export function useMoiAppletBridge(runtime: MoiAppletRuntime): void {
  const runtimeRef = useRef(runtime)
  runtimeRef.current = runtime

  useEffect(() => {
    const bridge: MoiAppletRuntime = {
      focusTab: (tab, params) => runtimeRef.current.focusTab(tab, params)
    }
    window.moi = bridge
    return () => {
      if (window.moi === bridge) delete window.moi
    }
  }, [])
}
