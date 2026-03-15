import { useEffect, useState } from 'react'

const SPLIT_MIN_WIDTH = 1184 // 40 + 640 + 64 + 400 + 40

export function useCanFitSidebar() {
  const [fits, setFits] = useState(() => window.innerWidth >= SPLIT_MIN_WIDTH)
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${SPLIT_MIN_WIDTH}px)`)
    const handler = (e: MediaQueryListEvent) => setFits(e.matches)
    mq.addEventListener('change', handler)
    setFits(mq.matches)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return fits
}
