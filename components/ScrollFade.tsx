import React, { useEffect, useRef, useState } from 'react'

import { cn } from '../shared/cn'

type ScrollFadeProps = {
  children: React.ReactNode
  className?: string
}

export function ScrollFade({ children, className }: ScrollFadeProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [top, setTop] = useState(false)
  const [bottom, setBottom] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const check = () => {
      setTop(el.scrollTop > 0)
      setBottom(el.scrollTop < el.scrollHeight - el.clientHeight - 1)
    }

    check()
    el.addEventListener('scroll', check, { passive: true })
    const ro = new ResizeObserver(check)
    ro.observe(el)

    return () => {
      el.removeEventListener('scroll', check)
      ro.disconnect()
    }
  }, [])

  return (
    <div
      ref={ref}
      className={cn(
        'overflow-y-auto',
        top && bottom && 'mask-fade-y',
        top && !bottom && 'mask-fade-top',
        !top && bottom && 'mask-fade-bottom',
        className
      )}
    >
      {children}
    </div>
  )
}
