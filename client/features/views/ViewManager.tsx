// The workspace's view surface: every view the user has open lives here, and
// switching tabs picks one of them instead of tearing the old one down and
// building the new one up.
//
// Why no transition between views: a view is an agent-authored bundle with its
// own styles and its own state. Animating the swap means keeping the outgoing
// DOM alive past the moment React drops the applet's <style> tag, so the view
// spends its exit unstyled. Keeping views mounted removes the problem instead
// of timing around it — the switch is instant, and a view only ever loads once.
//
// The one animation left is the rebuild dissolve: when the view you are looking
// at is rebuilt, the new build fades in over the old one. That is safe here
// because both builds share the slot's style tag (see ViewSlot), and it is
// worth the 200ms — it is the only signal that the thing under your cursor just
// changed underneath you.
import { Activity, type ComponentType, useCallback, useEffect, useRef, useState } from 'react'

import { Spinner } from '@/client/components/ui/spinner'
import { appletScope, appletStyleKey } from '@/client/features/applets/applet-cache'
import { useAppletStyle } from '@/client/features/applets/applet-styles'
import { useAppletThumbnails } from '@/client/features/applets/applet-thumbnail'
import {
  type AppletComponentProps,
  type AppletState,
  useView
} from '@/client/features/applets/useApplet'
import { WidgetErrorBoundary } from '@/client/features/applets/WidgetErrorBoundary'
import { useWorkspaceId } from '@/client/features/workspace/WorkspaceContext'
import { cn } from '@/client/lib/cn'
import type { ViewInfo } from '@/lib/types'

import {
  nextEvictionDelay,
  reconcileResidents,
  type ResidentView,
  sameResidents
} from './view-residency'

type ViewManagerProps = {
  views: ViewInfo[]
  // The view the active tab names, or null when another tab is on screen. The
  // manager stays mounted either way — that is what makes coming back from the
  // agent or widgets tab instant too.
  activeViewId: string | null
  // The active view's addressable state, read from navigation state (focusTab /
  // `moi tab focus`). `{}` on a fresh mount, a new browser tab, or a plain
  // tab-bar click — a view must render sensibly with that.
  params: Record<string, unknown>
}

export function ViewManager({ views, activeViewId, params }: ViewManagerProps) {
  const residents = useResidentViews(activeViewId, views)
  // Render in workspace order, not residency order: the policy ranks views by
  // recency, and reordering the children would make React move live DOM around
  // on every switch. The slots are stacked absolutely with one visible, so
  // their order on the page carries no meaning.
  const resident = new Set(residents.map(entry => entry.id))

  return (
    // Hidden rather than unmounted when no view tab is on screen: the parked
    // views keep their DOM, and `display: none` keeps this layer out of the
    // layout and out of the way of pointer events on the tab that IS on screen.
    <div className={cn('relative min-h-0 flex-1 overflow-hidden', !activeViewId && 'hidden')}>
      {views
        .filter(view => resident.has(view.id))
        .map(view => (
          <ViewSlot key={view.id} view={view} active={view.id === activeViewId} params={params} />
        ))}
    </div>
  )
}

// The views mounted right now: the active one, plus the recently-visited ones
// parked offscreen. The policy (and its timing) lives in view-residency.ts.
function useResidentViews(activeId: string | null, views: ViewInfo[]): ResidentView[] {
  const [residents, setResidents] = useState<ResidentView[]>([])
  // A workspace refetch hands us a new array on every event; residency only
  // cares whether a view appeared or disappeared. So the effect keys off the id
  // set, and the reconcile reads the current list through the ref.
  const viewsRef = useRef(views)
  viewsRef.current = views
  const availableIds = views.map(view => view.id).join('\n')

  const reconcile = useCallback(() => {
    setResidents(current => {
      const next = reconcileResidents(current, {
        activeId,
        available: new Set(viewsRef.current.map(view => view.id)),
        now: Date.now()
      })
      return sameResidents(current, next) ? current : next
    })
  }, [activeId])

  // Promote the view the user switched to, and release the one it replaced.
  useEffect(() => {
    reconcile()
  }, [availableIds, reconcile])

  // Then evict on the retention deadline — one timer, for the nearest one.
  useEffect(() => {
    const delay = nextEvictionDelay(residents, Date.now())
    if (delay === null) return
    const timer = setTimeout(reconcile, delay)
    return () => clearTimeout(timer)
  }, [reconcile, residents])

  return residents
}

type ViewSlotProps = {
  view: ViewInfo
  active: boolean
  params: Record<string, unknown>
}

// One resident view. The bundle it holds is loaded and kept fresh for as long
// as the slot lives — a view rebuilt while parked picks the new build up in
// place, so it is current the moment the user comes back to it.
function ViewSlot({ view, active, params }: ViewSlotProps) {
  const workspaceId = useWorkspaceId()
  const bundle = useView(view.id)
  const { current, outgoing } = useLoadedBundle(bundle, active)
  // A parked view keeps rendering with the params it was last shown with: the
  // active view's `focusTab` state is not its to render.
  const [shownParams, setShownParams] = useState(params)
  if (active && shownParams !== params) setShownParams(params)

  // The applet's <style> is acquired HERE, outside the Activity below. Hiding
  // an Activity unmounts its children's effects, which would strip the styles
  // off the page while the DOM they style is still parked — the exact flash
  // this component exists to remove. The tag drops when the slot is evicted.
  // Holding it here is also what lets the dissolve below overlap two builds:
  // the styles belong to the slot, not to either frame. The active view's sheet
  // is raised to the end of <head> so the global at-rule names it shares with
  // the parked views resolve to the one on screen.
  useAppletStyle(
    appletStyleKey('views', workspaceId, view.id),
    current?.version ?? bundle.version,
    active
  )

  const failed = bundle.status === 'error'
  useAppletThumbnails({
    kind: 'view',
    enabled: active && Boolean(current) && !failed,
    targets: [
      {
        id: view.id,
        revision: view.revision
      }
    ]
  })

  return (
    <>
      {active && failed && (
        <p className="absolute inset-0 p-4 text-xs text-destructive">{bundle.error}</p>
      )}
      {active && !failed && !current && <ViewSplash />}
      {current &&
        !failed && (
          // React hides these nodes with `display: none` while the Activity is
          // hidden, so a parked view neither paints nor swallows clicks.
          <Activity mode={active ? 'visible' : 'hidden'}>
            {outgoing && (
              <ViewFrame key={outgoing.version} view={view} build={outgoing} params={shownParams} />
            )}
            <ViewFrame
              key={current.version}
              view={view}
              build={current}
              params={shownParams}
              entering={outgoing !== null}
              thumbnailTarget
            />
          </Activity>
        )}
    </>
  )
}

type ViewFrameProps = {
  view: ViewInfo
  build: ViewBuild
  params: Record<string, unknown>
  // Play the rebuild dissolve. Set on the incoming build only, and only while
  // the build it replaced is still rendered underneath it.
  entering?: boolean
  thumbnailTarget?: boolean
}

// One build of one view, in its style scope. Frames stack absolutely, so during
// a rebuild the incoming one dissolves in over the outgoing one still on screen.
function ViewFrame({ view, build, params, entering, thumbnailTarget }: ViewFrameProps) {
  const workspaceId = useWorkspaceId()

  return (
    <div
      data-applet-thumbnail={thumbnailTarget ? `view:${view.id}` : undefined}
      data-applet={appletScope('views', view.id)}
      className={cn(
        // Keep applet z-indexes inside the view. Host overlays render after this
        // frame and should always stack above the view as a single unit.
        'absolute inset-0 isolate overflow-auto',
        entering && 'animate-in duration-200 ease-out blur-in-4 fade-in'
      )}
    >
      <WidgetErrorBoundary
        name={view.id}
        kind="view"
        workspaceId={workspaceId}
        resetKey={build.version}
      >
        <build.Component params={params} />
      </WidgetErrorBoundary>
    </div>
  )
}

type ViewBuild = {
  Component: ComponentType<AppletComponentProps>
  version: number
}

type LoadedBundle = {
  // The build to render, held across reloads. A rebuild flips the bundle back
  // to `loading` for as long as the fetch takes, and swapping a live view for a
  // spinner every time the agent edits it is worse than showing the previous
  // build for that moment. The splash is for a view with nothing to show yet —
  // the first time it is opened.
  current: ViewBuild | null
  // The build `current` just replaced, kept underneath for the length of the
  // dissolve so the new one fades in over the view instead of over an empty
  // panel. Null except during a rebuild swap on screen.
  outgoing: ViewBuild | null
}

// How long the outgoing build stays underneath. Matches the `duration-200` the
// incoming frame animates with.
const DISSOLVE_MS = 200

function useLoadedBundle(bundle: AppletState, dissolve: boolean): LoadedBundle {
  const [loaded, setLoaded] = useState<LoadedBundle>({ current: null, outgoing: null })

  if (bundle.status === 'ready' && loaded.current?.version !== bundle.version) {
    const build = { Component: bundle.Component, version: bundle.version }
    // The first build of a view has nothing to dissolve from, and a parked view
    // has nobody watching — both swap straight in.
    setLoaded(previous => ({ current: build, outgoing: dissolve ? previous.current : null }))
  }

  useEffect(() => {
    if (!loaded.outgoing) return
    const timer = setTimeout(
      () => setLoaded(previous => ({ ...previous, outgoing: null })),
      DISSOLVE_MS
    )
    return () => clearTimeout(timer)
  }, [loaded.outgoing])

  return loaded
}

// A view's one loading moment: the first open, while its bundle is fetched. The
// delay keeps it off screen entirely for a fast load — the common case, since
// the module cache outlives eviction and only the network trip is new.
function ViewSplash() {
  return (
    <div className="absolute inset-0 flex animate-in items-center justify-center delay-150 duration-200 fill-mode-both fade-in">
      <Spinner className="text-muted-foreground" />
    </div>
  )
}
