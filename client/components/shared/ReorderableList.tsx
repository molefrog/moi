import { useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { motion } from 'motion/react'

import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardCode,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors
} from '@dnd-kit/core'
import type { DragEndEvent, DragOverEvent, DraggableAttributes } from '@dnd-kit/core'

import { cn } from '@/client/lib/cn'

type ReorderableId = string

const KEYBOARD_CODES = {
  start: [KeyboardCode.Space],
  cancel: [KeyboardCode.Esc],
  end: [KeyboardCode.Space, KeyboardCode.Tab]
}

export type ReorderableRenderState = {
  isDragging: boolean
  isOver: boolean
  dragDisabled: boolean
  dragHandleProps: Partial<DraggableAttributes> & Record<string, unknown>
}

type ReorderableListProps<T> = {
  items: T[]
  getId: (item: T) => ReorderableId
  className?: string
  itemClassName?: (item: T, state: ReorderableRenderState) => string | undefined
  dragDisabled?: boolean
  onReorder: (orderedIds: ReorderableId[]) => void
  renderItem: (item: T, state: ReorderableRenderState) => ReactNode
  renderPlaceholder?: (item: T) => ReactNode
  renderOverlay?: (item: T) => ReactNode
}

export function reorderIds(order: ReorderableId[], active: ReorderableId, over: ReorderableId) {
  const from = order.indexOf(active)
  const to = order.indexOf(over)
  if (from < 0 || to < 0 || from === to) return order

  const next = [...order]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

export function ReorderableList<T>({
  items,
  getId,
  className,
  itemClassName,
  dragDisabled = false,
  onReorder,
  renderItem,
  renderPlaceholder,
  renderOverlay
}: ReorderableListProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { keyboardCodes: KEYBOARD_CODES })
  )
  const [draggingId, setDraggingId] = useState<ReorderableId | null>(null)
  const [dragOrder, setDragOrder] = useState<ReorderableId[] | null>(null)
  const dragOrderRef = useRef<ReorderableId[] | null>(null)

  const ids = useMemo(() => items.map(getId), [items, getId])
  const itemById = useMemo(() => new Map(items.map(item => [getId(item), item])), [items, getId])
  const displayedIds = draggingId && dragOrder ? dragOrder : ids
  const displayedItems = displayedIds
    .map(id => itemById.get(id))
    .filter((item): item is T => Boolean(item))
  const draggingItem = draggingId ? itemById.get(draggingId) : undefined
  const disabled = dragDisabled || items.length < 2

  const handleDragOver = (event: DragOverEvent) => {
    const activeId = String(event.active.id)
    const overId = event.over ? String(event.over.id) : undefined
    const currentOrder = dragOrderRef.current
    if (!overId || overId === activeId || !currentOrder) return

    const nextOrder = reorderIds(currentOrder, activeId, overId)
    if (nextOrder === currentOrder) return
    dragOrderRef.current = nextOrder
    setDragOrder(nextOrder)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const activeId = String(event.active.id)
    const finalOrder = dragOrderRef.current
    dragOrderRef.current = null
    setDraggingId(null)
    setDragOrder(null)
    if (!finalOrder || finalOrder.join('|') === ids.join('|')) return
    if (!finalOrder.includes(activeId)) return
    onReorder(finalOrder)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={event => {
        const order = items.map(getId)
        setDraggingId(String(event.active.id))
        dragOrderRef.current = order
        setDragOrder(order)
      }}
      onDragOver={handleDragOver}
      onDragCancel={() => {
        dragOrderRef.current = null
        setDraggingId(null)
        setDragOrder(null)
      }}
      onDragEnd={handleDragEnd}
    >
      <div className={className}>
        {displayedItems.map(item => (
          <ReorderableListItem
            key={getId(item)}
            id={getId(item)}
            item={item}
            disabled={disabled}
            itemClassName={itemClassName}
            renderItem={renderItem}
            renderPlaceholder={renderPlaceholder}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {draggingItem && renderOverlay ? renderOverlay(draggingItem) : null}
      </DragOverlay>
    </DndContext>
  )
}

type ReorderableListItemProps<T> = {
  id: ReorderableId
  item: T
  disabled: boolean
  itemClassName?: (item: T, state: ReorderableRenderState) => string | undefined
  renderItem: (item: T, state: ReorderableRenderState) => ReactNode
  renderPlaceholder?: (item: T) => ReactNode
}

function ReorderableListItem<T>({
  id,
  item,
  disabled,
  itemClassName,
  renderItem,
  renderPlaceholder
}: ReorderableListItemProps<T>) {
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({ id, disabled })
  const {
    attributes,
    listeners,
    setNodeRef: setDraggableRef,
    isDragging
  } = useDraggable({
    id,
    disabled,
    attributes: { roleDescription: 'sortable item' }
  })
  const setNodeRef = (el: HTMLElement | null) => {
    setDroppableRef(el)
    setDraggableRef(el)
  }
  const state: ReorderableRenderState = {
    isDragging,
    isOver,
    dragDisabled: disabled,
    dragHandleProps: disabled ? {} : { ...attributes, ...listeners }
  }

  return (
    <motion.div
      layout
      ref={setNodeRef}
      className={cn('relative', itemClassName?.(item, state))}
      transition={{ type: 'spring', duration: 0.25, bounce: 0 }}
    >
      {isDragging && renderPlaceholder?.(item)}
      {renderItem(item, state)}
    </motion.div>
  )
}
