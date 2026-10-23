import { expect, test } from 'bun:test'

import { createKeyedLock, type Lease } from './lock'

const tick = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms))

test('runs holders of one key one at a time, in order', async () => {
  const withLock = createKeyedLock(1_000)
  const order: string[] = []
  const hold = (name: string, ms: number) =>
    withLock('ws', async () => {
      order.push(`${name}:start`)
      await tick(ms)
      order.push(`${name}:end`)
    })
  await Promise.all([hold('a', 20), hold('b', 0), hold('c', 0)])
  expect(order).toEqual(['a:start', 'a:end', 'b:start', 'b:end', 'c:start', 'c:end'])
})

test('different keys do not wait for each other', async () => {
  const withLock = createKeyedLock(1_000)
  let release!: () => void
  const blocked = withLock('first', () => new Promise<void>(resolve => (release = resolve)))
  await tick()
  expect(await withLock('second', async () => 'done')).toBe('done')
  release()
  await blocked
})

test('a holder past the timeout stops blocking, and its lease is no longer current', async () => {
  const withLock = createKeyedLock(20)
  let staleLease!: Lease
  let release!: () => void
  const stuck = withLock('ws', async lease => {
    staleLease = lease
    await new Promise<void>(resolve => (release = resolve))
    return lease.isCurrent()
  })
  await tick()
  expect(staleLease.isCurrent()).toBe(true)

  const next = await withLock('ws', async lease => lease.isCurrent())
  expect(next).toBe(true)
  release()
  expect(await stuck).toBe(false)
})

test('a failing holder releases the lock', async () => {
  const withLock = createKeyedLock(1_000)
  await expect(
    withLock('ws', async () => {
      throw new Error('boom')
    })
  ).rejects.toThrow('boom')
  expect(await withLock('ws', async () => 'after')).toBe('after')
})
