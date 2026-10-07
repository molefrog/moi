import { opendir } from 'node:fs/promises'

export const DISCOVERY_SCAN_MS = 2000
export const DISCOVERY_HEAD_BYTES = 64 * 1024

// Stream a bounded number of entries instead of materializing whole histories.
// The deadline is cooperative: pending filesystem operations finish normally.
export async function* discoveryEntries(dir: string, limit: number, deadline: number) {
  if (performance.now() >= deadline) return
  try {
    const handle = await opendir(dir)
    let count = 0
    for await (const entry of handle) {
      if (performance.now() >= deadline) break
      yield entry
      if (++count >= limit) break
    }
  } catch {
    // Missing or unreadable history must not prevent other providers loading.
  }
}
