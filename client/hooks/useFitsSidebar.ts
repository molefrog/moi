import { useEffect, useRef, useState } from 'react'

// Resolve a CSS length token (px or rem) defined on :root to pixels, so the fit
// math shares the layout tokens in index.css rather than duplicating values.
function tokenPx(name: string): number {
  const root = document.documentElement
  const raw = getComputedStyle(root).getPropertyValue(name).trim()
  const value = parseFloat(raw)
  return raw.endsWith('rem') ? value * parseFloat(getComputedStyle(root).fontSize) : value
}

// Observe the content row (full panel width — stable regardless of whether the
// chat is docked) and dock the chat only while the widget area would stay at
// its content width (--column-w) once the chat takes its minimum (--chat-min).
// Measuring the widget area element directly would oscillate: docking shrinks
// it back under the threshold, which would undock it, which would grow it, etc.
export function useFitsSidebar<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [fits, setFits] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const minWidget = tokenPx('--column-w')
    const chatMin = tokenPx('--chat-min')
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setFits(entry.contentRect.width - chatMin >= minWidget)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return { ref, fits }
}
