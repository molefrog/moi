// A bare view address discovers tools; adding /name invokes one.
export function parseCallAddress(address: string): { viewId: string; name?: string } | null {
  const match = /^view:([A-Za-z0-9_$-]+)(?:\/([A-Za-z0-9_.-]+))?$/.exec(address)
  return match ? { viewId: match[1], ...(match[2] ? { name: match[2] } : {}) } : null
}
