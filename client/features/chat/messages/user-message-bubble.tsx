import { useEffect, useId, useRef, useState } from 'react'
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react'
import { Button } from '@/client/components/ui/button'
import { cn } from '@/client/lib/cn'
import { MarkdownContent } from './markdown-content'

type UserMessageBubbleProps = { content: string }

export function UserMessageBubble({ content }: UserMessageBubbleProps) {
  const [expanded, setExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(false)
  const viewportRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const contentId = useId()

  useEffect(() => {
    const viewport = viewportRef.current
    const body = contentRef.current
    if (!viewport || !body) return
    const measure = () => {
      // Keep the toggle while expanded; measure again after collapsing.
      if (!expanded) setOverflowing(body.scrollHeight > viewport.clientHeight + 1)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(body)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [content, expanded])

  return (
    <div className="max-w-full min-w-0 rounded-lg bg-primary px-3 py-2 text-sm leading-normal wrap-anywhere text-primary-foreground inset-shadow-[0_0_10px_color-mix(in_oklab,var(--color-white)_30%,transparent)]">
      <div
        id={contentId}
        ref={viewportRef}
        className={cn(!expanded && 'max-h-80 overflow-hidden')}
        onFocusCapture={() => {
          if (overflowing) setExpanded(true)
        }}
      >
        <div ref={contentRef}>
          <MarkdownContent content={content} />
        </div>
      </div>
      {overflowing && (
        <>
          {!expanded && <div aria-hidden="true">…</div>}
          <Button
            variant="ghost"
            size="sm"
            className="mt-4 px-0 font-normal hover:bg-transparent hover:text-inherit"
            aria-expanded={expanded}
            aria-controls={contentId}
            onClick={() => setExpanded(value => !value)}
          >
            {expanded ? 'Show less' : 'Show more'}
            {expanded ? <IconChevronUp stroke={1.75} /> : <IconChevronDown stroke={1.75} />}
          </Button>
        </>
      )}
    </div>
  )
}
