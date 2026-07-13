import { useLayoutEffect, useRef, useState } from 'react'

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
  const [fits, setFits] = useState(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    const update = (width: number) => {
      const columnWidth = tokenPx('--column-w')
      const chatMin = tokenPx('--chat-min')
      setFits(width - chatMin >= columnWidth)
    }

    update(el.getBoundingClientRect().width)

    const ro = new ResizeObserver(([entry]) => {
      if (entry) update(entry.contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return { ref, fits }
}
