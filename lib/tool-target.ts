// Tool targets share the same `view:<id>` form as workspace tab IDs.
export function parseToolTarget(target: string): { viewId: string } | null {
  const match = /^view:([A-Za-z0-9_$-]+)$/.exec(target)
  return match ? { viewId: match[1] } : null
}
