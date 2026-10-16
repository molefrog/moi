'use client'

// Preserves the surrounding CSS scope across a portal.
import * as React from 'react'

type ScopedPortalProps = {
  portal: React.ElementType
  children?: React.ReactNode
} & Record<string, unknown>

function ScopedPortal({ portal: Portal, children, ...props }: ScopedPortalProps) {
  const [scope, setScope] = React.useState<string | undefined>(undefined)
  const marker = React.useCallback((node: HTMLElement | null) => {
    if (node) {
      setScope(node.closest('[data-applet]')?.getAttribute('data-applet') ?? undefined)
    }
  }, [])

  // Activity disconnects refs while hidden, but portal DOM lives outside its
  // hidden subtree. Hide the portal root too, and restore it on reconnection.
  const portalRef = React.useCallback((node: HTMLDivElement | null) => {
    if (!node) return
    node.hidden = false
    node.inert = false
    return () => {
      node.hidden = true
      node.inert = true
    }
  }, [])

  return (
    <>
      <span hidden ref={marker} />
      <Portal {...props} ref={portalRef}>
        <div data-applet={scope} className="contents">
          {children}
        </div>
      </Portal>
    </>
  )
}

export { ScopedPortal }
