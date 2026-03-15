import { type RefObject, useEffect, useRef, useState } from 'react'

type ScrollFadeState = {
  ref: RefObject<HTMLDivElement | null>
  showTopFade: boolean
  showBottomFade: boolean
}

export function useScrollFade(): ScrollFadeState {
  const ref = useRef<HTMLDivElement>(null)
  const [showTopFade, setShowTopFade] = useState(false)
  const [showBottomFade, setShowBottomFade] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const updateFades = () => {
      const atTop = el.scrollTop <= 1
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1
      const scrollable = el.scrollHeight > el.clientHeight + 1

      setShowTopFade(scrollable && !atTop)
      setShowBottomFade(scrollable && !atBottom)
    }

    updateFades()
    el.addEventListener('scroll', updateFades, { passive: true })
    window.addEventListener('resize', updateFades)

    return () => {
      el.removeEventListener('scroll', updateFades)
      window.removeEventListener('resize', updateFades)
    }
  }, [])

  return { ref, showTopFade, showBottomFade }
}
