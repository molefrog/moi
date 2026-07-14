export function startHmrWatchdog() {
  if (!import.meta.hot) return
  let lastEventAt = Date.now()
  for (const event of ['bun:beforeUpdate', 'bun:afterUpdate', 'bun:ws:connect'] as const) {
    import.meta.hot.on(event, () => (lastEventAt = Date.now()))
  }

  const devScript = document.querySelector<HTMLScriptElement>('[data-bun-dev-server-script]')
  if (!devScript) return

  let baseline = new URL(devScript.src).pathname
  let staleSince: number | null = null

  const checkStale = async () => {
    try {
      const html = await (await fetch('/', { cache: 'no-store' })).text()
      const current = html.match(/\/_bun\/client\/index-[0-9a-f]+\.js/)?.[0]
      if (!current || current === baseline) {
        staleSince = null
        return
      }

      staleSince ??= Date.now()
      if (lastEventAt >= staleSince - 5_000) {
        baseline = current
        staleSince = null
      } else if (Date.now() - staleSince > 10_000) {
        location.reload()
      }
    } catch {
      // The server may be between supervisor restarts. The next check retries.
    }
  }

  setInterval(checkStale, 5_000)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkStale()
  })
}
