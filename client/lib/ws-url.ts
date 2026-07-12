// Build a WebSocket URL for a same-origin path, deriving the scheme from the
// page protocol: `wss://` when the page is served over HTTPS, `ws://` otherwise.
// Hardcoding `ws://` breaks live updates behind any TLS-terminating proxy
// (Cloudflare Tunnel, nginx, ngrok) — the browser blocks the insecure socket as
// mixed content. The proxy forwards `wss://` to the origin's plain `ws://`, so
// no server change is needed.
export function wsUrl(path: string) {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${scheme}://${location.host}${path}`
}
