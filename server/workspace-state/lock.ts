// One holder per key at a time. A holder that runs past the timeout stops
// blocking the queue: the next waiter starts, and the stale holder's lease
// reports it is no longer current so it can refuse to commit late.

export type Lease = {
  isCurrent(): boolean
}

export class LockTimeoutError extends Error {
  constructor(key: string) {
    super(`Lock on ${key} expired before the write could commit`)
  }
}

export function createKeyedLock(timeoutMs: number) {
  const tails = new Map<string, Promise<void>>()
  const owners = new Map<string, number>()
  let lastToken = 0

  return async function withLock<T>(key: string, run: (lease: Lease) => Promise<T>): Promise<T> {
    const previous = tails.get(key) ?? Promise.resolve()
    let release!: () => void
    const released = new Promise<void>(resolve => (release = resolve))
    tails.set(key, released)
    await previous

    const token = ++lastToken
    owners.set(key, token)
    const expiry = setTimeout(release, timeoutMs)
    expiry.unref?.()
    try {
      return await run({ isCurrent: () => owners.get(key) === token })
    } finally {
      clearTimeout(expiry)
      release()
      if (tails.get(key) === released) {
        tails.delete(key)
        owners.delete(key)
      }
    }
  }
}
