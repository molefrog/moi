import { beforeEach, describe, expect, test } from 'bun:test'

const storedValues = new Map<string, string>()
const localStorage = {
  getItem: (key: string) => storedValues.get(key) ?? null,
  setItem: (key: string, value: string) => storedValues.set(key, value),
  removeItem: (key: string) => storedValues.delete(key)
}

Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: { localStorage }
})

const { useUiStore } = await import('./ui')

beforeEach(() => {
  storedValues.clear()
  useUiStore.setState({ skillAutoUpdateEnabled: false })
})

describe('skill Auto-update preference', () => {
  test('enables one persisted preference for every workspace', () => {
    expect(useUiStore.getState().skillAutoUpdateEnabled).toBe(false)

    useUiStore.getState().enableSkillAutoUpdate()

    expect(useUiStore.getState().skillAutoUpdateEnabled).toBe(true)
    expect(JSON.parse(storedValues.get('moi:ui') ?? '{}')).toMatchObject({
      state: { skillAutoUpdateEnabled: true }
    })
  })
})
