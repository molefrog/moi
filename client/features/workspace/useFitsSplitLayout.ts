import { useLayoutEffect, useRef, useState } from 'react'

export type WorkspaceSplitLayoutConstraints = {
  workspaceMinWidth: number
  chatMinWidth: number
  chatMaxWidth: number
}

type SplitLayoutState = WorkspaceSplitLayoutConstraints & {
  fits: boolean
}

function tokenPx(name: string): number {
  const root = document.documentElement
  const raw = getComputedStyle(root).getPropertyValue(name).trim()
  const value = Number.parseFloat(raw)
  if (!Number.isFinite(value)) return 0
  return raw.endsWith('rem') ? value * Number.parseFloat(getComputedStyle(root).fontSize) : value
}

// Observe the full workspace row, not either pane, so split-fit measurement does
// not oscillate when the chat column appears or disappears.
export function useFitsSplitLayout<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [state, setState] = useState<SplitLayoutState | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    let updateFrame: number | null = null
    let pendingWidth = 0

    const update = (width: number) => {
      const workspaceMinWidth = tokenPx('--column-w')
      const chatMinWidth = tokenPx('--chat-min')
      const chatMaxWidth = tokenPx('--chat-max')
      const next = {
        fits: width - chatMinWidth >= workspaceMinWidth,
        workspaceMinWidth,
        chatMinWidth,
        chatMaxWidth
      }
      setState(current =>
        current?.fits === next.fits &&
        current.workspaceMinWidth === next.workspaceMinWidth &&
        current.chatMinWidth === next.chatMinWidth &&
        current.chatMaxWidth === next.chatMaxWidth
          ? current
          : next
      )
    }

    const scheduleUpdate = (width: number) => {
      pendingWidth = width
      if (updateFrame !== null) return
      updateFrame = requestAnimationFrame(() => {
        updateFrame = null
        update(pendingWidth)
      })
    }

    update(el.getBoundingClientRect().width)

    const ro = new ResizeObserver(([entry]) => {
      if (entry) scheduleUpdate(entry.contentRect.width)
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      if (updateFrame !== null) cancelAnimationFrame(updateFrame)
    }
  }, [])

  return {
    ref,
    fits: state?.fits ?? false,
    constraints: state
      ? {
          workspaceMinWidth: state.workspaceMinWidth,
          chatMinWidth: state.chatMinWidth,
          chatMaxWidth: state.chatMaxWidth
        }
      : null
  }
}
