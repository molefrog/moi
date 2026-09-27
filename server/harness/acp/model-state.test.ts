import { afterEach, describe, expect, test } from 'bun:test'

import {
  cacheAcpModelState,
  clearAcpModelCache,
  peekAcpModelState,
  storeAcpModelState
} from './model-state'
import type { AcpModelState } from './wire'

const path = '/moi-acp-selector-cache-test'

function state(model: string, scope = 'gateway'): AcpModelState {
  return {
    availableModels: [{ modelId: 'a' }, { modelId: 'b' }],
    currentModelId: model,
    defaultModelId: 'a',
    configOptionsScope: scope,
    configOptionsByModel: {
      [model]: [
        {
          id: 'effort',
          type: 'select',
          name: 'Effort',
          currentValue: model,
          options: [{ value: model, name: model }]
        }
      ]
    }
  }
}

afterEach(() => {
  clearAcpModelCache(path)
  clearAcpModelCache(`${path}/other`)
})

describe('ACP per-model selector cache', () => {
  test('does not combine selector choices across fingerprints or backend scopes', async () => {
    cacheAcpModelState(path, state('a'), 'account-a', 'fx')
    cacheAcpModelState(path, state('b'), 'account-b', 'fx')
    let cached = await peekAcpModelState(path, 'account-b', 'fx')
    expect(Object.keys(cached?.configOptionsByModel ?? {})).toEqual(['b'])
    expect(peekAcpModelState(path, 'account-a', 'fx')).toBeUndefined()

    cacheAcpModelState(path, state('a', 'codex'), 'account-b', 'fx')
    cached = await peekAcpModelState(path, 'account-b', 'fx')
    expect(Object.keys(cached?.configOptionsByModel ?? {})).toEqual(['a'])
    expect(cached?.configOptionsScope).toBe('codex')

    // An unknown generation cannot inherit observations from a known account.
    cacheAcpModelState(path, state('b', 'codex'), undefined, 'fx')
    cached = await peekAcpModelState(path, undefined, 'fx')
    expect(Object.keys(cached?.configOptionsByModel ?? {})).toEqual(['b'])
  })

  test('keeps observations separate across ACP providers and workspaces', async () => {
    cacheAcpModelState(path, state('a'), 'same', 'fx')
    cacheAcpModelState(path, state('b'), 'same', 'hermes')
    cacheAcpModelState(`${path}/other`, state('b'), 'same', 'fx')
    expect(
      Object.keys((await peekAcpModelState(path, 'same', 'fx'))?.configOptionsByModel ?? {})
    ).toEqual(['a'])
    expect(
      Object.keys((await peekAcpModelState(path, 'same', 'hermes'))?.configOptionsByModel ?? {})
    ).toEqual(['b'])
    expect(
      Object.keys(
        (await peekAcpModelState(`${path}/other`, 'same', 'fx'))?.configOptionsByModel ?? {}
      )
    ).toEqual(['b'])
  })

  test('replaces explicit empty selectors and drops models removed from the catalog', async () => {
    cacheAcpModelState(path, state('a'), 'same', 'fx')
    cacheAcpModelState(path, state('b'), 'same', 'fx')
    cacheAcpModelState(path, { ...state('a'), configOptionsByModel: { a: [] } }, 'same', 'fx')
    let cached = await peekAcpModelState(path, 'same', 'fx')
    expect(cached?.configOptionsByModel?.a).toEqual([])
    expect(cached?.configOptionsByModel?.b).toHaveLength(1)

    cacheAcpModelState(path, { ...state('b'), availableModels: [{ modelId: 'b' }] }, 'same', 'fx')
    cached = await peekAcpModelState(path, 'same', 'fx')
    expect(Object.keys(cached?.configOptionsByModel ?? {})).toEqual(['b'])
  })

  test('a failed earlier discovery cannot discard a later confirmed snapshot', async () => {
    storeAcpModelState(path, Promise.reject(new Error('discovery failed')), 'same', 'fx')
    cacheAcpModelState(path, state('b'), 'same', 'fx')
    expect((await peekAcpModelState(path, 'same', 'fx'))?.currentModelId).toBe('b')
  })
})
