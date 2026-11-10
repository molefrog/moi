import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardCode,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent, DraggableAttributes } from '@dnd-kit/core'
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'

type ReorderableId = string

// Enter is left out of `start` so it keeps activating the link or tab.
const KEYBOARD_CODES = {
  start: [KeyboardCode.Space],
  cancel: [KeyboardCode.Esc],
  end: [KeyboardCode.Space, KeyboardCode.Tab]
}

export type ReorderableRenderState = {
  isDragging: boolean
  dragHandleProps: Partial<DraggableAttributes> & Record<string, unknown>
}

type ReorderableListProps<T> = {
  items: T[]
  getId: (item: T) => ReorderableId
  axis: 'x' | 'y'
  className?: string
  isItemDragDisabled?: (item: T) => boolean
  onReorder: (orderedIds: ReorderableId[]) => void
  renderItem: (item: T, state: ReorderableRenderState) => ReactNode
  renderPlaceholder?: (item: T) => ReactNode
  renderOverlay?: (item: T) => ReactNode
}

function sameOrder(a: ReorderableId[], b: ReorderableId[]) {
  return a.length === b.length && a.every((id, index) => id === b[index])
}

/**
 * A sortable list on the stock `@dnd-kit/sortable` setup: items keep their DOM
 * order while dragging and are shifted with transforms, the dragged item leaves
 * its slot behind (`renderPlaceholder`) and follows the pointer in a
 * `DragOverlay` (`renderOverlay`).
 */
export function ReorderableList<T>({
  items,
  getId,
  axis,
  className,
  isItemDragDisabled,
  onReorder,
  renderItem,
  renderPlaceholder,
  renderOverlay
}: ReorderableListProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      keyboardCodes: KEYBOARD_CODES,
      coordinateGetter: sortableKeyboardCoordinates
    })
  )
  const listRef = useRef<HTMLDivElement>(null)
  const [draggingId, setDraggingId] = useState<ReorderableId>()
  // Mounted on the first drag and kept, so the drop animation can finish. The
  // server renderer used by tests cannot render portals.
  const [overlayMounted, setOverlayMounted] = useState(false)

  // The dropped order is shown right away and held until the owner's `items`
  // change, so a drop never flashes the old order while the owner saves it.
  const ids = items.map(getId)
  const [syncedIds, setSyncedIds] = useState(ids)
  const [order, setOrder] = useState(ids)
  let displayedIds = order
  if (!sameOrder(syncedIds, ids)) {
    setSyncedIds(ids)
    setOrder(ids)
    displayedIds = ids
  }

  const itemById = new Map(items.map(item => [getId(item), item]))
  const displayedItems = displayedIds
    .map(id => itemById.get(id))
    .filter((item): item is T => item !== undefined)
  const draggingItem = draggingId === undefined ? undefined : itemById.get(draggingId)
  const reorderableCount = isItemDragDisabled
    ? items.filter(item => !isItemDragDisabled(item)).length
    : items.length
  const disabled = reorderableCount < 2

  const handleDragStart = ({ active, activatorEvent }: DragStartEvent) => {
    setDraggingId(String(active.id))
    setOverlayMounted(true)
    // Keep receiving the pointer while it is over an iframe (a view can embed
    // one), which otherwise swallows the release and leaves the drag stuck.
    // Captured on the list, not the item: a captured link would get a native
    // click on release and navigate.
    if (activatorEvent instanceof PointerEvent) {
      listRef.current?.setPointerCapture(activatorEvent.pointerId)
    }
  }

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setDraggingId(undefined)
    if (!over || over.id === active.id) return
    const from = displayedIds.indexOf(String(active.id))
    const to = displayedIds.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    const next = arrayMove(displayedIds, from, to)
    setOrder(next)
    onReorder(next)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragCancel={() => setDraggingId(undefined)}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={displayedIds}
        strategy={axis === 'x' ? horizontalListSortingStrategy : verticalListSortingStrategy}
      >
        <div ref={listRef} className={className}>
          {displayedItems.map(item => (
            <ReorderableListItem
              key={getId(item)}
              id={getId(item)}
              item={item}
              disabled={disabled || isItemDragDisabled?.(item) === true}
              renderItem={renderItem}
              renderPlaceholder={renderPlaceholder}
            />
          ))}
        </div>
      </SortableContext>
      {/* Portaled so the dragged copy is not clipped by the panels next to the list. */}
      {overlayMounted &&
        createPortal(
          <DragOverlay>
            {draggingItem && renderOverlay ? renderOverlay(draggingItem) : null}
          </DragOverlay>,
          document.body
        )}
    </DndContext>
  )
}

type ReorderableListItemProps<T> = {
  id: ReorderableId
  item: T
  disabled: boolean
  renderItem: (item: T, state: ReorderableRenderState) => ReactNode
  renderPlaceholder?: (item: T) => ReactNode
}

function ReorderableListItem<T>({
  id,
  item,
  disabled,
  renderItem,
  renderPlaceholder
}: ReorderableListItemProps<T>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
    attributes: { roleDescription: 'sortable item' }
  })

  return (
    <div
      ref={setNodeRef}
      className="relative"
      // The drag offset is computed per frame by dnd-kit, so it cannot be a
      // utility class. Translate only: items of different sizes must not scale.
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        transition
      }}
    >
      {isDragging && renderPlaceholder?.(item)}
      {renderItem(item, {
        isDragging,
        dragHandleProps: disabled ? {} : { ...attributes, ...listeners }
      })}
    </div>
  )
}
