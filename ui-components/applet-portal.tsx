'use client'

// Keeps portalled overlays inside the applet's scoped styles.
import * as React from 'react'

type AppletPortalProps = {
  portal: React.ElementType
  children?: React.ReactNode
} & Record<string, unknown>

function AppletPortal({ portal: Portal, children, ...props }: AppletPortalProps) {
  const [scope, setScope] = React.useState<string | undefined>(undefined)
  const marker = React.useCallback((node: HTMLElement | null) => {
    if (node) {
      setScope(node.closest('[data-applet]')?.getAttribute('data-applet') ?? undefined)
    }
  }, [])

  return (
    <>
      <span hidden ref={marker} />
      <Portal {...props}>
        <div data-applet={scope} className="contents">
          {children}
        </div>
      </Portal>
    </>
  )
}

export { AppletPortal }
