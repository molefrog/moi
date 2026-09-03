import { type ComponentProps, useCallback, useState } from 'react'

import { AnimatePresence, LayoutGroup, motion } from 'motion/react'

import {
  IconCheck,
  IconLayoutGridAdd,
  IconLetterCase,
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
import { Skeleton } from '@/client/components/ui/skeleton'
import { cn } from '@/client/lib/cn'
import type { ViewBuilder, ViewInfo, WidgetInfo } from '@/lib/types'
import { isDefaultWidget } from '@/lib/default-widgets'

import { HiddenPanel } from './HiddenPanel'
import { WorkspaceName } from './WorkspaceName'
import { WidgetCanvas } from './WidgetCanvas'

type NoWidgetsCreatedProps = {
  onCreateWidget: () => void
}

function NoWidgetsCreated({ onCreateWidget }: NoWidgetsCreatedProps) {
  return (
    <div className="relative size-full">
      <div aria-hidden="true" className="grid size-full grid-cols-2 grid-rows-2 gap-2">
        {[0, 1, 2, 3].map(slot => (
          <Skeleton
            key={slot}
            className="size-full animate-none rounded-2xl texture-checker [corner-shape:superellipse(1.2)]"
          />
        ))}
      </div>

      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex h-full w-full max-w-(--column-w) flex-col items-center justify-center gap-4 bg-radial from-background from-40% to-transparent to-80% text-center">
          <div className="flex flex-col gap-1.5">
            <h2 className="font-medium">A little empty here</h2>
            <p className="mx-auto max-w-xs text-sm text-muted-foreground">
              Widgets are small apps that can read data, perform tasks, and surface important
              information
            </p>
          </div>
          <Button type="button" variant="secondary" onClick={onCreateWidget}>
            <IconLayoutGridAdd data-icon="inline-start" stroke={1.5} />
            New widget
          </Button>
        </div>
      </div>
    </div>
  )
}

type OverviewHeaderProps = {
  editing: boolean
  customizing: boolean
  onEditingChange: (editing: boolean) => void
  onCustomize: () => void
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
  editing,
  customizing,
  onEditingChange,
  onCustomize
}: OverviewHeaderProps) {
  return (
    <div className="flex size-full items-center gap-4">
      <WorkspaceName />
      <div className="flex shrink-0 items-center gap-2">
        <OverviewHeaderAction
          Icon={IconReplace}
          label="Customize"
          active={editing}
          onClick={() => onEditingChange(!editing)}
        />
        <OverviewHeaderAction
          Icon={IconLetterCase}
          label="Style"
          active={customizing}
          onClick={onCustomize}
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
  editing: boolean
  customizing: boolean
  onCustomize: () => void
  onEditingChange: (editing: boolean) => void
  // Authoritative widget set from useWidgets; positions come from layout.
  widgets: WidgetInfo[]
  views: ViewInfo[]
  builders: ViewBuilder[]
}

export function Overview({
  onCreateWidget,
  onCreateView,
  onOpenView,
  editing,
  customizing,
  onCustomize,
  onEditingChange,
  widgets,
  views,
  builders
}: OverviewProps) {
  const { layout, setLayout } = useWorkspaceLayoutCtx()
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

  const [panelRef, panelHeight] = usePanelHeight()
  const panelOpen = editing

  useAppletThumbnails({
    kind: 'widget',
    enabled: !editing,
    targets: visibleItems
      .filter(item => !isDefaultWidget(item.id))
      .map(item => ({
        id: item.id,
        revision: widgetById.get(item.id)?.revision
      }))
  })

  function renderItem(id: string) {
    const defaultWidget = renderDefaultWidget(id, { views, builders, onOpenView, onCreateView })
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
          editing={editing}
          header={
            <OverviewHeader
              editing={editing}
              customizing={customizing}
              onEditingChange={onEditingChange}
              onCustomize={onCustomize}
            />
          }
          emptyState={
            showCreationState ? <NoWidgetsCreated onCreateWidget={onCreateWidget} /> : undefined
          }
          bottomInset={panelOpen ? panelHeight : 0}
          renderItem={renderItem}
          onMove={move}
          onRemove={hide}
        />

        <AnimatePresence>
          {editing && (
            <HiddenPanel
              ref={panelRef}
              items={hiddenItems}
              renderItem={renderItem}
              onCreateWidget={onCreateWidget}
              onClose={() => onEditingChange(false)}
              onRestore={restore}
            />
          )}
        </AnimatePresence>
      </LayoutGroup>
    </div>
  )
}
