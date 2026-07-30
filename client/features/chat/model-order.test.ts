import { describe, expect, test } from 'bun:test'

import {
  hasEffortChoice,
  resolveDisplayedEffort,
  resolveEffortIndex,
  resolveFastMode,
  sortModelsByProviderOrder
} from '@/client/features/chat/model-order'
import type { Model } from '@/lib/types'

function model(value: string, resolvedModel?: string): Model {
  return { value, resolvedModel, displayName: value }
}

describe('sortModelsByProviderOrder', () => {
  test('orders Anthropic model families while preserving SDK order within each family', () => {
    const models = [
      model('haiku', 'claude-haiku-4-5-20251001'),
      model('opus-5', 'claude-opus-5'),
      model('opus[1m]', 'claude-opus-4-8[1m]'),
      model('sonnet', 'claude-sonnet-5'),
      model('fable', 'claude-fable-5'),
      model('opus', 'claude-opus-4-8')
    ]

    expect(sortModelsByProviderOrder(models, 'claude-code').map(item => item.value)).toEqual([
      'fable',
      'opus-5',
      'opus[1m]',
      'opus',
      'sonnet',
      'haiku'
    ])
  })

  test('recognizes Anthropic aliases without a resolved model', () => {
    const models = [model('haiku'), model('opus[1m]'), model('fable'), model('sonnet')]

    expect(sortModelsByProviderOrder(models, 'claude-code').map(item => item.value)).toEqual([
      'fable',
      'opus[1m]',
      'sonnet',
      'haiku'
    ])
  })

  test('places unknown models first in backend order', () => {
    const models = [
      model('new-model-b', 'claude-new-model-b'),
      model('haiku', 'claude-haiku-4-5-20251001'),
      model('new-model-a', 'claude-new-model-a'),
      model('fable', 'claude-fable-5')
    ]

    expect(sortModelsByProviderOrder(models, 'claude-code').map(item => item.value)).toEqual([
      'new-model-b',
      'new-model-a',
      'fable',
      'haiku'
    ])
  })

  test('handles missing Anthropic model families', () => {
    const models = [model('sonnet', 'claude-sonnet-5'), model('fable', 'claude-fable-5')]

    expect(sortModelsByProviderOrder(models, 'claude-code').map(item => item.value)).toEqual([
      'fable',
      'sonnet'
    ])
  })

  test('preserves Codex backend order while its configuration is empty', () => {
    const models = [
      { ...model('gpt-5.4'), displayName: '5.4' },
      { ...model('gpt-5.6-sol'), displayName: '5.6 Sol' },
      { ...model('gpt-5.6-terra'), displayName: '5.6 Terra' }
    ]

    expect(sortModelsByProviderOrder(models, 'codex')).toEqual(models)
  })

  test('preserves OpenClaw backend order while its configuration is empty', () => {
    const models = [model('provider/model-b'), model('provider/model-a')]

    expect(sortModelsByProviderOrder(models, 'openclaw')).toEqual(models)
  })
})

describe('resolveDisplayedEffort', () => {
  const levels = ['low', 'medium', 'high', 'xhigh', 'max']

  test('keeps the last supported explicit choice', () => {
    expect(resolveDisplayedEffort(levels, 'medium')).toBe('medium')
  })

  test('uses High when there is no supported explicit choice', () => {
    expect(resolveDisplayedEffort(levels, undefined)).toBe('high')
    expect(resolveDisplayedEffort(levels, 'unsupported')).toBe('high')
  })

  test('uses the highest available level when High is unavailable', () => {
    expect(resolveDisplayedEffort(['low', 'medium', 'max'], undefined)).toBe('max')
  })
})

describe('resolveEffortIndex', () => {
  const levels = ['low', 'medium', 'high', 'xhigh', 'max']

  test('maps SDK effort order from faster to smarter', () => {
    expect(resolveEffortIndex(levels, 'low')).toBe(0)
    expect(resolveEffortIndex(levels, 'high')).toBe(2)
    expect(resolveEffortIndex(levels, 'max')).toBe(4)
  })

  test('maps partial lists and their fallback', () => {
    const partial = ['low', 'high', 'max']

    expect(resolveEffortIndex(partial, 'high')).toBe(1)
    expect(resolveEffortIndex(partial, 'unsupported')).toBe(1)
  })

  test('returns no position for an empty effort list', () => {
    expect(resolveEffortIndex([], undefined)).toBe(-1)
  })
})

describe('hasEffortChoice', () => {
  test('only offers the control when the model has multiple levels', () => {
    expect(hasEffortChoice([])).toBe(false)
    expect(hasEffortChoice(['high'])).toBe(false)
    expect(hasEffortChoice(['low', 'high'])).toBe(true)
  })
})

describe('resolveFastMode', () => {
  const supported = {
    ...model('fast-model'),
    supportsFastMode: true,
    defaultFastMode: true
  }

  test('uses the provider default until moi stores a preference', () => {
    expect(resolveFastMode(supported, undefined)).toBe(true)
  })

  test('lets an explicit moi preference override the provider default', () => {
    expect(resolveFastMode(supported, false)).toBe(false)
    expect(resolveFastMode({ ...supported, defaultFastMode: false }, true)).toBe(true)
  })

  test('stays disabled for an unsupported model', () => {
    expect(resolveFastMode(model('unsupported'), true)).toBe(false)
  })
})
