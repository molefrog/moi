import {
  type IndexKey,
  type TLPageId,
  type TLRecord,
  type TLStore,
  ZERO_INDEX_KEY,
  createBindingId,
  createShapeId,
  defaultShapeUtils,
  getIndexAbove
} from 'tldraw'

// Hand-built tldraw record construction, shared by the headless op executor
// (scratchpad-executor.ts) and the diagram compiler (scratchpad-diagram.ts).
// Records built here are validated by `store.put`, so a malformed one throws
// instead of corrupting the snapshot — that validation is the real guarantee.

// Each shape type's default props, read once from its ShapeUtil. `getDefaultProps`
// is an instance method but doesn't touch the editor for the shapes we create, so a
// throwaway instance is enough; the result is static per type, so we cache it.
const shapeDefaults = new Map<string, Record<string, unknown>>()
export function defaultProps(type: string): Record<string, unknown> {
  let cached = shapeDefaults.get(type)
  if (!cached) {
    const Util = defaultShapeUtils.find(u => (u as unknown as { type: string }).type === type)
    if (!Util) throw new Error(`Unknown shape type "${type}"`)
    // eslint-disable-next-line new-cap -- Util is a class constructor pulled from a list
    const util = new (Util as unknown as new (editor: unknown) => {
      getDefaultProps(): Record<string, unknown>
    })({})
    cached = util.getDefaultProps()
    shapeDefaults.set(type, cached)
  }
  return { ...cached }
}

export function firstPageId(store: TLStore): TLPageId {
  for (const record of store.allRecords()) {
    if (record.typeName === 'page') return record.id
  }
  // ensureStoreIsUsable always leaves a page; this is unreachable in practice.
  throw new Error('Scratchpad has no page')
}

// The next fractional index above every shape on the page, so a new shape lands on
// top. IndexKeys sort lexicographically, so a string max is a valid ordering.
export function nextIndex(store: TLStore, pageId: TLPageId): IndexKey {
  let max: IndexKey = ZERO_INDEX_KEY
  for (const record of store.allRecords()) {
    if (record.typeName === 'shape' && record.parentId === pageId && record.index > max) {
      max = record.index
    }
  }
  return getIndexAbove(max)
}

// Hand-build a shape record. TS can't correlate `type` with its matching props
// variant across the TLRecord union, so we assert — `store.put` validates the
// result at runtime, which is the real guarantee.
export function shapeRecord(fields: {
  id: ReturnType<typeof createShapeId>
  type: string
  x: number
  y: number
  index: IndexKey
  parentId: TLPageId
  props: Record<string, unknown>
}): TLRecord {
  return {
    typeName: 'shape',
    rotation: 0,
    isLocked: false,
    opacity: 1,
    meta: {},
    ...fields
  } as unknown as TLRecord
}

// Bind one arrow terminal to a target shape, so the arrow follows when it moves.
export function arrowBinding(
  arrowId: ReturnType<typeof createShapeId>,
  targetId: ReturnType<typeof createShapeId>,
  terminal: 'start' | 'end'
): TLRecord {
  return {
    id: createBindingId(),
    typeName: 'binding',
    type: 'arrow',
    fromId: arrowId,
    toId: targetId,
    meta: {},
    props: {
      terminal,
      normalizedAnchor: { x: 0.5, y: 0.5 },
      isPrecise: false,
      isExact: false,
      snap: 'none'
    }
  } as unknown as TLRecord
}
