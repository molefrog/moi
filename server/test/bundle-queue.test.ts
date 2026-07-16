import { describe, expect, test } from 'bun:test'

import { serializeWorkspaceBundle } from '../bundle-queue'

describe('workspace bundle queue', () => {
  test('serializes bundles for one workspace', async () => {
    const order: string[] = []
    let releaseFirst: (() => void) | undefined
    const firstGate = new Promise<void>(resolve => {
      releaseFirst = resolve
    })

    const first = serializeWorkspaceBundle('/workspace/one', async () => {
      order.push('first:start')
      await firstGate
      order.push('first:end')
    })
    const second = serializeWorkspaceBundle('/workspace/one', async () => {
      order.push('second:start')
      order.push('second:end')
    })

    await Bun.sleep(0)
    expect(order).toEqual(['first:start'])
    releaseFirst?.()
    await Promise.all([first, second])
    expect(order).toEqual(['first:start', 'first:end', 'second:start', 'second:end'])
  })

  test('allows different workspaces to bundle concurrently', async () => {
    const active = new Set<string>()
    let overlapped = false
    let release: (() => void) | undefined
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    const run = (workspace: string) =>
      serializeWorkspaceBundle(workspace, async () => {
        active.add(workspace)
        if (active.size === 2) overlapped = true
        await gate
        active.delete(workspace)
      })

    const pending = [run('/workspace/a'), run('/workspace/b')]
    await Bun.sleep(0)
    expect(overlapped).toBe(true)
    release?.()
    await Promise.all(pending)
  })
})
