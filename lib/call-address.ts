// CLI addresses share the tab vocabulary. Internal RPC module paths stay unchanged.
export function normalizeFunctionAddress(address: string): string {
  if (address.startsWith('view:')) return `views/${address.slice(5)}`
  if (address.startsWith('widget:')) return `widgets/${address.slice(7)}`
  return address
}

export function parseToolAddress(address: string): { viewId: string; name: string } | null {
  const match = /^view:([A-Za-z0-9_$-]+)\/([A-Za-z0-9_-]+)$/.exec(address)
  return match ? { viewId: match[1], name: match[2] } : null
}
