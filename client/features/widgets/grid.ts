import type { LayoutItem } from 'react-grid-layout'

export type GridItem = {
  id: string
  w: number
  h: number
  x?: number
  y?: number
}

export function findFreePosition(
  existing: LayoutItem[],
  w: number,
  h: number,
  cols: number
): { x: number; y: number } {
  const maxY = existing.reduce((m, l) => Math.max(m, l.y + l.h), 0)

  for (let y = 0; y <= maxY + h; y++) {
    for (let x = 0; x <= cols - w; x++) {
      const overlaps = existing.some(
        l => !(x + w <= l.x || l.x + l.w <= x || y + h <= l.y || l.y + l.h <= y)
      )
      if (!overlaps) return { x, y }
    }
  }

  return { x: 0, y: maxY }
}

export function packItems(items: GridItem[], existing: LayoutItem[] = [], cols = 4): LayoutItem[] {
  const placed: LayoutItem[] = []
  for (const item of items) {
    const { x, y } =
      item.x !== undefined && item.y !== undefined
        ? { x: item.x, y: item.y }
        : findFreePosition([...existing, ...placed], item.w, item.h, cols)
    placed.push({ i: item.id, x, y, w: item.w, h: item.h })
  }
  return placed
}
