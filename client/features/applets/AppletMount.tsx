import { type ReactNode } from 'react'

import { useWorkspaceId } from '@/client/features/workspace/WorkspaceContext'

import { type AppletSegment, appletScope, appletStyleKey } from './applet-cache'
import { useAppletStyle } from './applet-styles'

type AppletMountProps = {
  segment: AppletSegment
  name: string
  version: number
  children: ReactNode
}

// The style scope for one mounted applet: puts the `data-applet` attribute the
// bundle's scoped CSS selectors key off (see server/bundler/applet-css.ts) on a
// wrapper filling the parent box, and keeps the applet's <style> tag mounted
// exactly as long as the applet is — unmounting removes the styles from the
// page. This is the widget path. Views don't use it: ViewManager parks a view's
// DOM offscreen instead of unmounting it, so it holds the styles itself, above
// the boundary that hides the view.
//
// The wrapper is positioned because it is the containing block for
// applet-scoped overlays: the `drawer` ui component portals into the nearest
// `[data-applet]` element and positions against it — that is how it covers
// the applet and nothing else.
export function AppletMount({ segment, name, version, children }: AppletMountProps) {
  const workspaceId = useWorkspaceId()
  useAppletStyle(appletStyleKey(segment, workspaceId, name), version)

  return (
    <div data-applet={appletScope(segment, name)} className="relative size-full">
      {children}
    </div>
  )
}
