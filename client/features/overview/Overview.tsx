import { type ComponentProps, useCallback, useState } from 'react'

import { AnimatePresence, LayoutGroup, motion } from 'motion/react'

import {
  IconCheck,
  IconLetterCase,
  IconPlus,
  IconReplace,
  IconSettings,
  type TablerIcon
} from '@tabler/icons-react'

import { useAppletThumbnails } from '@/client/features/applets/applet-thumbnail'
import { WorkspaceSettings } from '@/client/features/settings/WorkspaceSettings'
import { useWorkspaceLayoutCtx } from '@/client/features/workspace/WorkspaceLayoutContext'
import { renderDefaultWidget } from '@/client/features/overview/default/registry'
import { findWidgetPosition, updateStoredGridPositions } from '@/client/features/overview/grid'
import type { GridItem, GridPosition, PositionedGridItem } from '@/client/features/overview/grid'
import { WidgetShell } from '@/client/features/applets/WidgetShell'
import { Button } from '@/client/components/ui/button'
import { cn } from '@/client/lib/cn'
import { useUiStore } from '@/client/store/ui'
import type { ViewBuilder, ViewInfo, WidgetInfo } from '@/lib/types'
import { isDefaultWidget } from '@/lib/default-widgets'

import { HiddenPanel } from './HiddenPanel'
import { WorkspaceName } from './WorkspaceName'
import { WidgetCanvas } from './WidgetCanvas'

type NoWidgetsCreatedProps = {
  onCreateWidget: () => void
  showOnboarding: boolean
}

function NoWidgetsCreated({ onCreateWidget, showOnboarding }: NoWidgetsCreatedProps) {
  return (
    <div className="relative grid size-full grid-cols-2 grid-rows-2 gap-2 overflow-hidden">
      <div className="overflow-hidden rounded-2xl bg-muted texture-checker [corner-shape:superellipse(1.2)]">
        <div className="flex size-full items-start justify-start bg-radial-[at_top_left] from-muted from-40% to-transparent p-12">
          <h2 className="text-2xl font-semibold text-foreground">Widgets</h2>
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl bg-muted texture-checker [corner-shape:superellipse(1.2)]" />
      <div className="overflow-hidden rounded-2xl bg-muted texture-checker [corner-shape:superellipse(1.2)]" />
      <div className="overflow-hidden rounded-2xl bg-muted texture-checker [corner-shape:superellipse(1.2)]">
        {showOnboarding && (
          <div className="flex size-full items-end justify-end">
            <span className="m-8 max-w-56 text-right text-sm text-muted-foreground">
              Widgets can surface information, read data, and perform actions
            </span>
          </div>
        )}
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <Button
          type="button"
          variant="outline"
          className="rounded-xl px-4 py-6 transition-shadow duration-300 ease-out hover:shadow-md"
          onClick={onCreateWidget}
        >
          <IconPlus data-icon="inline-start" stroke={1.5} />
          New widget
        </Button>
      </div>
    </div>
  )
}

type OverviewHeaderProps = {
  customizing: boolean
  styling: boolean
  onCustomizingChange: (customizing: boolean) => void
  onStyle: () => void
}

type OverviewHeaderActionProps = Omit<ComponentProps<typeof Button>, 'children'> & {
  Icon: TablerIcon
  label: string
  active?: boolean
}

function OverviewHeaderAction({
  Icon,
  label,
  active,
  className,
  ...props
}: OverviewHeaderActionProps) {
  return (
    <Button
      type="button"
      variant={active ? 'default' : 'secondary'}
      className={cn('relative h-16 w-24 rounded-lg px-4 py-0 text-xs [&_svg]:size-5', className)}
      aria-pressed={active}
      {...props}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={active ? 'done' : 'action'}
          className="flex flex-col items-center gap-1.5"
          variants={{
            from: { opacity: 0, filter: 'blur(4px)' },
            to: { opacity: 1, filter: 'blur(0px)' }
          }}
          initial="from"
          animate="to"
          exit="from"
          transition={{ type: 'spring', duration: 0.2, bounce: 0 }}
        >
          {active ? <IconCheck stroke={1.5} /> : <Icon stroke={1.5} />}
          <span>{active ? 'Done' : label}</span>
        </motion.span>
      </AnimatePresence>
    </Button>
  )
}

function OverviewHeader({
  customizing,
  styling,
  onCustomizingChange,
  onStyle
}: OverviewHeaderProps) {
  return (
    <div className="flex size-full items-center gap-4">
      <WorkspaceName />
      <div className="flex shrink-0 items-center gap-2">
        <OverviewHeaderAction
          Icon={IconReplace}
          label="Customize"
          active={customizing}
          onClick={() => onCustomizingChange(!customizing)}
        />
        <OverviewHeaderAction
          Icon={IconLetterCase}
          label="Style"
          active={styling}
          onClick={onStyle}
        />
        <WorkspaceSettings
          renderTrigger={() => <OverviewHeaderAction Icon={IconSettings} label="Settings" />}
        />
      </div>
    </div>
  )
}

// Reserve the open bottom panel's height in the canvas so every widget stays reachable.
function usePanelHeight() {
  const [height, setHeight] = useState(0)
  const ref = useCallback((node: HTMLDivElement | null) => {
    if (!node) return
    const ro = new ResizeObserver(([entry]) => {
      const box = entry.borderBoxSize?.[0]
      setHeight(box ? box.blockSize : entry.contentRect.height)
    })
    ro.observe(node)
    return () => ro.disconnect()
  }, [])
  return [ref, height] as const
}

type OverviewProps = {
  onCreateWidget: () => void
  onCreateView: () => void
  onOpenView: (viewId: string) => void
  customizing: boolean
  styling: boolean
  onStyle: () => void
  onCustomizingChange: (customizing: boolean) => void
  // Authoritative widget set from useWidgets; positions come from layout.
  widgets: WidgetInfo[]
  views: ViewInfo[]
  builders: ViewBuilder[]
}

export function Overview({
  onCreateWidget,
  onCreateView,
  onOpenView,
  customizing,
  styling,
  onStyle,
  onCustomizingChange,
  widgets,
  views,
  builders
}: OverviewProps) {
  const { layout, setLayout } = useWorkspaceLayoutCtx()
  const hasSentMessageFromMoi = useUiStore(state => state.hasSentMessageFromMoi)
  const widgetById = new Map(widgets.map(widget => [widget.id, widget]))

  const gridIds = new Set(layout.widgetGrid.map(g => g.i))

  const visibleItems: PositionedGridItem[] = layout.widgetGrid
    .filter(g => widgetById.has(g.i))
    .map(g => {
      const widget = widgetById.get(g.i)!
      return { id: g.i, w: widget.config.colSpan, h: widget.config.rowSpan, x: g.x, y: g.y }
    })

  const hiddenItems: GridItem[] = widgets
    .filter(w => !gridIds.has(w.id))
    .map(w => ({ id: w.id, w: w.config.colSpan, h: w.config.rowSpan }))
  const showCreationState = visibleItems.every(item => isDefaultWidget(item.id))
  const showOnboarding =
    !hasSentMessageFromMoi && widgets.every(widget => isDefaultWidget(widget.id))

  const [panelRef, panelHeight] = usePanelHeight()
  const panelOpen = customizing

  useAppletThumbnails({
    kind: 'widget',
    enabled: !customizing,
    targets: visibleItems
      .filter(item => !isDefaultWidget(item.id))
      .map(item => ({
        id: item.id,
        revision: widgetById.get(item.id)?.revision
      }))
  })

  function renderItem(id: string) {
    const defaultWidget = renderDefaultWidget(id, {
      views,
      builders,
      onOpenView,
      onCreateView,
      showOnboarding
    })
    if (defaultWidget) return defaultWidget
    return <WidgetShell name={id} />
  }

  function hide(id: string) {
    setLayout({ widgetGrid: layout.widgetGrid.filter(g => g.i !== id) })
  }

  function restore(id: string) {
    const widget = widgetById.get(id)
    if (!widget) return
    const gridWithSizes = layout.widgetGrid.map(g => {
      const w = widgetById.get(g.i)
      return { ...g, w: w?.config.colSpan ?? 1, h: w?.config.rowSpan ?? 1 }
    })
    const pos = findWidgetPosition(gridWithSizes, widget.config.colSpan, widget.config.rowSpan)
    setLayout({ widgetGrid: [...layout.widgetGrid, { i: id, x: pos.x, y: pos.y }] })
  }

  function move(positions: GridPosition[]) {
    setLayout({ widgetGrid: updateStoredGridPositions(layout.widgetGrid, positions) })
  }

  return (
    // Shared working area below the header and positioning context for the bottom panel.
    <div className="relative min-h-0 flex-1 bg-background">
      <LayoutGroup>
        <WidgetCanvas
          items={visibleItems}
          customizing={customizing}
          header={
            <OverviewHeader
              customizing={customizing}
              styling={styling}
              onCustomizingChange={onCustomizingChange}
              onStyle={onStyle}
            />
          }
          emptyState={
            showCreationState ? (
              <NoWidgetsCreated onCreateWidget={onCreateWidget} showOnboarding={showOnboarding} />
            ) : undefined
          }
          bottomInset={panelOpen ? panelHeight : 0}
          renderItem={renderItem}
          onMove={move}
          onRemove={hide}
        />

        <AnimatePresence>
          {customizing && (
            <HiddenPanel
              ref={panelRef}
              items={hiddenItems}
              renderItem={renderItem}
              onCreateWidget={onCreateWidget}
              onClose={() => onCustomizingChange(false)}
              onRestore={restore}
            />
          )}
        </AnimatePresence>
      </LayoutGroup>
    </div>
  )
}
