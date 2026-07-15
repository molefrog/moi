import type { ReactNode } from 'react'

import { useWorkspaceId } from '@/client/features/workspace/WorkspaceContext'

import { type AppletSegment, appletStyleKey } from './applet-cache'
import { useAppletStyle } from './applet-styles'

type AppletMountProps = {
  segment: AppletSegment
  name: string
  version: number
  children: ReactNode
}

// The style scope for one mounted applet. Renders the `data-applet` container
// the bundle's scoped CSS selectors key off (see server/bundler/applet-css.ts) and
// keeps the applet's <style> tag mounted exactly as long as the applet is —
// unmounting removes the styles from the page. `contents` keeps the wrapper
// out of layout while still anchoring descendant selectors and inherited
// theme variables.
export function AppletMount({ segment, name, version, children }: AppletMountProps) {
  const workspaceId = useWorkspaceId()
  useAppletStyle(appletStyleKey(segment, workspaceId, name), version)

  const kind = segment === 'widgets' ? 'widget' : 'view'
  return (
    <div data-applet={`${kind}:${name}`} className="contents">
      {children}
    </div>
  )
}
