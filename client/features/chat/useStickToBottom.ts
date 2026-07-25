import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

// Best-practice chat scroll behavior — "stick to bottom, but respect the user":
//   • Pinned to the bottom by default: new content (new turns, streaming tokens,
//     images loading) keeps the latest line in view.
//   • The moment the user scrolls up, un-pin — never yank them back down while
//     they read history.
//   • Re-pin automatically when they scroll back to (near) the bottom.
//   • `scrollToBottom()` for the "jump to latest" button and for send.
//   • On mount and whenever `resetKey` changes (thread switch), jump to bottom.
//
// Content growth is followed via a ResizeObserver on the scroll content, so we
// don't depend on React deps to know when to scroll — it just works for any
// height change, including per-token streaming.

// Within this many px of the bottom still counts as "at the bottom" — covers
// sub-pixel rounding and lets a small overscroll keep the pin.
const STICK_THRESHOLD_PX = 48

type StickToBottom = {
  // True when pinned to (near) the bottom — drives the jump-to-latest button.
  atBottom: boolean
  // Scroll to the bottom and re-pin. `smooth` for user-initiated jumps.
  scrollToBottom: (behavior?: ScrollBehavior) => void
  // Show top-anchored content such as the initial Chat welcome without the
  // resize observer pulling it back to the bottom.
  scrollToTop: () => void
}

export function useStickToBottom(
  scrollRef: RefObject<HTMLElement | null>,
  resetKey?: unknown
): StickToBottom {
  // Ref (not state) so the scroll/resize handlers read the latest value without
  // re-subscribing; `atBottom` state mirrors it for rendering the button.
  const pinnedRef = useRef(true)
  const [atBottom, setAtBottom] = useState(true)

  const setPinned = useCallback((pinned: boolean) => {
    pinnedRef.current = pinned
    setAtBottom(prev => (prev === pinned ? prev : pinned))
  }, [])

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'auto') => {
      const el = scrollRef.current
      if (!el) return
      setPinned(true)
      el.scrollTo({ top: el.scrollHeight, behavior })
    },
    [scrollRef, setPinned]
  )

  const scrollToTop = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setPinned(false)
    el.scrollTo({ top: 0, behavior: 'auto' })
  }, [scrollRef, setPinned])

  // Track whether the user is at the bottom. A programmatic scroll-to-bottom
  // also fires this with distance ≈ 0, so pinned stays true — no fight.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight
      setPinned(distance <= STICK_THRESHOLD_PX)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [scrollRef, setPinned])

  // Follow content growth while pinned. Observing the content element catches
  // every height change (new turns, streaming text, images) without React deps.
  // Setting scrollTop doesn't change the observed size, so there's no RO loop.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const content = el.firstElementChild ?? el
    const ro = new ResizeObserver(() => {
      if (pinnedRef.current) el.scrollTop = el.scrollHeight
    })
    ro.observe(content)
    return () => ro.disconnect()
  }, [scrollRef])

  // Jump to bottom on mount and on thread switch (before paint, so no flash).
  // If the new thread's content is still loading, the ResizeObserver above lands
  // us at the bottom once it arrives (pin is set here).
  useLayoutEffect(() => {
    scrollToBottom('auto')
  }, [resetKey, scrollToBottom])

  return { atBottom, scrollToBottom, scrollToTop }
}
