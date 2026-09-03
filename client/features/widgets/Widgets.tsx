import { useCallback, useState } from 'react'

import { AnimatePresence, LayoutGroup, motion } from 'motion/react'

import {
  IconCheck,
  IconEdit,
  IconLetterCase,
  IconPlus,
  IconSettings,
  type TablerIcon
} from '@tabler/icons-react'

import { useAppletThumbnails } from '@/client/features/applets/applet-thumbnail'
import { WorkspaceSettings } from '@/client/features/settings/WorkspaceSettings'
import { useWorkspaceLayoutCtx } from '@/client/features/workspace/WorkspaceLayoutContext'
import { renderDefaultWidget } from '@/client/features/widgets/default/registry'
import { findFreePosition } from '@/client/features/widgets/grid'
import type { GridItem } from '@/client/features/widgets/grid'
import { WidgetShell } from '@/client/features/applets/WidgetShell'
import { Button } from '@/client/components/ui/button'
import { Skeleton } from '@/client/components/ui/skeleton'
import type { ViewBuilder, ViewInfo, WidgetInfo } from '@/lib/types'
import { isDefaultWidget } from '@/lib/default-widgets'

import { HiddenPanel } from './HiddenPanel'
import { WidgetGrid, WidgetGridLayout } from './WidgetGrid'
import { cn } from '@/client/lib/cn'

const EMPTY_WIDGET_ITEMS: GridItem[] = Array.from({ length: 4 }, (_, index) => ({
  id: `empty-widget-${index}`,
  w: 2,
  h: 1
}))

function renderEmptyWidget() {
  return (
    <Skeleton className="size-full animate-none rounded-2xl texture-checker [corner-shape:superellipse(1.2)]" />
  )
}

type NoWidgetsCreatedProps = {
  onCreateWidget: () => void
}

function NoWidgetsCreated({ onCreateWidget }: NoWidgetsCreatedProps) {
  return (
    <div className="relative min-h-0">
      <div aria-hidden="true">
        <WidgetGridLayout items={EMPTY_WIDGET_ITEMS} renderItem={renderEmptyWidget} />
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
            <IconPlus data-icon="inline-start" stroke={1.5} />
            Create widget
          </Button>
        </div>
      </div>
    </div>
  )
}

type WidgetsHeaderProps = {
  workspaceName: string
  editing: boolean
  customizing: boolean
  onEditingChange: (editing: boolean) => void
  onCustomize: () => void
}

type WidgetsHeaderActionProps = {
  Icon: TablerIcon
  label: string
  active?: boolean
  onClick: () => void
}

function WidgetsHeaderAction({ Icon, label, active, onClick }: WidgetsHeaderActionProps) {
  return (
    <Button
      type="button"
      variant="secondary"
      className={cn(
        'h-20 w-28 rounded-xl p-0 [&_svg]:size-6',
        active && 'bg-accent text-accent-foreground'
      )}
      aria-pressed={active}
      onClick={onClick}
    >
      <span className="flex size-full flex-col items-center justify-center gap-1.5 px-4">
        <Icon stroke={1.5} />
        <span>{label}</span>
      </span>
    </Button>
  )
}

function WidgetsHeader({
  workspaceName,
  editing,
  customizing,
  onEditingChange,
  onCustomize
}: WidgetsHeaderProps) {
  return (
    <div className="mx-auto my-6 flex w-full max-w-(--column-w) items-center gap-4">
      <h1 className="min-w-0 flex-1 truncate text-3xl font-medium">{workspaceName}</h1>
      <div className="flex shrink-0 items-center gap-2">
        <WidgetsHeaderAction
          Icon={editing ? IconCheck : IconEdit}
          label={editing ? 'Done' : 'Edit widgets'}
          active={editing}
          onClick={() => onEditingChange(!editing)}
        />
        <WidgetsHeaderAction
          Icon={IconLetterCase}
          label="Customize"
          active={customizing}
          onClick={onCustomize}
        />
        <WorkspaceSettings
          renderTrigger={open => (
            <WidgetsHeaderAction Icon={IconSettings} label="Settings" onClick={open} />
          )}
        />
      </div>
    </div>
  )
}

// Tracks the rendered (border-box) height of whichever bottom panel is open, so
// the grid can reserve matching space below it and every card stays reachable.
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

type WidgetsProps = {
  workspaceName: string
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

export function Widgets({
  workspaceName,
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
}: WidgetsProps) {
  const { layout, setLayout } = useWorkspaceLayoutCtx()
  const widgetById = new Map(widgets.map(widget => [widget.id, widget]))

  const gridIds = new Set(layout.widgetGrid.map(g => g.i))

  const visibleItems: GridItem[] = layout.widgetGrid
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
        revision: widgets.find(widget => widget.id === item.id)?.revision
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
    const pos = findFreePosition(gridWithSizes, widget.config.colSpan, widget.config.rowSpan, 4)
    setLayout({ widgetGrid: [...layout.widgetGrid, { i: id, x: pos.x, y: pos.y }] })
  }

  return (
    // Shared working area below the header and positioning context for the bottom panel.
    <div className="relative min-h-0 flex-1">
      <LayoutGroup>
        <div className="relative flex h-full flex-col overflow-y-auto p-4">
          <WidgetsHeader
            workspaceName={workspaceName}
            editing={editing}
            customizing={customizing}
            onEditingChange={onEditingChange}
            onCustomize={onCustomize}
          />
          {/* The open panel's height is reserved below the content so every card
              and the creation state can scroll clear of the panel. */}
          <motion.div
            className="flex min-h-0 flex-1 flex-col gap-2"
            animate={{ marginBottom: panelOpen ? panelHeight : 0 }}
            transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
          >
            {visibleItems.length > 0 && (
              <WidgetGrid
                items={visibleItems}
                editing={editing}
                renderItem={renderItem}
                onRemove={hide}
                onLayoutChange={items =>
                  setLayout({
                    widgetGrid: items.map(i => ({ i: i.id, x: i.x ?? 0, y: i.y ?? 0 }))
                  })
                }
              />
            )}
            {showCreationState && <NoWidgetsCreated onCreateWidget={onCreateWidget} />}
          </motion.div>
        </div>

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
