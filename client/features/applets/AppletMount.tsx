import { type ReactElement, type ReactNode, cloneElement, isValidElement } from 'react'

import { useWorkspaceId } from '@/client/features/workspace/WorkspaceContext'

import { type AppletSegment, appletStyleKey } from './applet-cache'
import { useAppletStyle } from './applet-styles'

type AppletMountProps = {
  segment: AppletSegment
  name: string
  version: number
  // Merge the scope attribute into the single child element instead of
  // rendering a wrapper — use when the caller already has a filled container
  // (e.g. the shells' motion.div), so no extra node enters the DOM. The child
  // must forward unknown props to its DOM element.
  asChild?: boolean
  children: ReactNode
}

// The style scope for one mounted applet: puts the `data-applet` attribute the
// bundle's scoped CSS selectors key off (see server/bundler/applet-css.ts) on a
// container, and keeps the applet's <style> tag mounted exactly as long as the
// applet is — unmounting removes the styles from the page. Without `asChild`
// it renders its own wrapper div filling the parent box (the widget path —
// merging onto the shell's motion.div interferes with AnimatePresence there);
// with `asChild` it merges onto the child element instead (the view path).
export function AppletMount({ segment, name, version, asChild, children }: AppletMountProps) {
  const workspaceId = useWorkspaceId()
  useAppletStyle(appletStyleKey(segment, workspaceId, name), version)

  const kind = segment === 'widgets' ? 'widget' : 'view'
  const scope = `${kind}:${name}`

  if (asChild && isValidElement(children)) {
    return cloneElement(children as ReactElement<{ 'data-applet'?: string }>, {
      'data-applet': scope
    })
  }
  return (
    <div data-applet={scope} className="size-full">
      {children}
    </div>
  )
}
