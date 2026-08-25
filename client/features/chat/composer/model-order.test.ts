import { describe, expect, test } from 'bun:test'

import {
  groupModels,
  hasEffortChoice,
  resolveDisplayedEffort,
  resolveEffortIndex,
  resolveFastMode,
  sortModelsByProviderOrder,
  splitModelGroup
} from '@/client/features/chat/composer/model-order'
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

  // OpenClaw resolves a per-model `thinkingDefault` — `low` on gpt-5.6-sol,
  // `medium` on gpt-5.6-luna, `off` on the Claude and ollama models.
  test("prefers the model's own default over the app-wide High", () => {
    expect(resolveDisplayedEffort(levels, undefined, 'low')).toBe('low')
    expect(resolveDisplayedEffort(['off', 'low', 'medium', 'high'], undefined, 'off')).toBe('off')
  })

  test('an explicit choice still outranks the model default', () => {
    expect(resolveDisplayedEffort(levels, 'max', 'low')).toBe('max')
  })

  test('a model default outside the menu is ignored', () => {
    expect(resolveDisplayedEffort(levels, undefined, 'ultra')).toBe('high')
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

describe('groupModels', () => {
  test('sections a grouped catalog in first-appearance order', () => {
    const models = [
      { ...model('nous:opus'), group: 'Nous Portal' },
      { ...model('ollama:llama4'), group: 'Ollama' },
      { ...model('nous:sonnet'), group: 'Nous Portal' }
    ]

    expect(
      groupModels(models, 'Models').map(group => [group.label, group.models.map(m => m.value)])
    ).toEqual([
      ['Nous Portal', ['nous:opus', 'nous:sonnet']],
      ['Ollama', ['ollama:llama4']]
    ])
  })

  test('keeps an ungrouped catalog in one fallback section', () => {
    const models = [model('opus'), model('sonnet')]
    const groups = groupModels(models, 'Models')

    expect(groups).toHaveLength(1)
    expect(groups[0]?.label).toBe('Models')
    expect(groups[0]?.models).toEqual(models)
  })
})

describe('splitModelGroup', () => {
  const group = (values: string[]) => ({
    label: 'Nous Portal',
    models: values.map(value => model(value))
  })

  test('shows a small group whole, with no overflow', () => {
    const small = group(['gpt-oss:20b', 'smollm3', 'qwen3.8'])

    expect(splitModelGroup(small, 'smollm3')).toEqual({
      label: 'Nous Portal',
      featured: small.models,
      more: []
    })
  })

  test('features frontier families and overflows the rest in backend order', () => {
    const large = group([
      'meta/llama-4-scout',
      'anthropic/claude-opus-5',
      'nvidia/nemotron-ultra',
      'openai/gpt-5.4',
      'google/gemini-3-pro',
      'x-ai/grok-4.5',
      'deepseek/deepseek-v4',
      'ai21/jamba-2'
    ])

    const split = splitModelGroup(large, 'anthropic/claude-opus-5')
    expect(split.featured.map(m => m.value)).toEqual([
      'anthropic/claude-opus-5',
      'openai/gpt-5.4',
      'google/gemini-3-pro',
      'x-ai/grok-4.5',
      'deepseek/deepseek-v4'
    ])
    expect(split.more.map(m => m.value)).toEqual([
      'meta/llama-4-scout',
      'nvidia/nemotron-ultra',
      'ai21/jamba-2'
    ])
  })

  test('hoists the selected model out of the overflow', () => {
    const large = group([
      'anthropic/claude-opus-5',
      'openai/gpt-5.4',
      'google/gemini-3-pro',
      'x-ai/grok-4.5',
      'deepseek/deepseek-v4',
      'nvidia/nemotron-ultra',
      'ai21/jamba-2',
      'microsoft/phi-5',
      'cohere/command-a'
    ])

    const split = splitModelGroup(large, 'ai21/jamba-2')
    expect(split.featured.map(m => m.value)).toEqual([
      'anthropic/claude-opus-5',
      'openai/gpt-5.4',
      'google/gemini-3-pro',
      'x-ai/grok-4.5',
      'deepseek/deepseek-v4',
      'ai21/jamba-2'
    ])
    expect(split.more.map(m => m.value)).toEqual([
      'nvidia/nemotron-ultra',
      'microsoft/phi-5',
      'cohere/command-a'
    ])
  })

  test('stays inline when the submenu would hide only a row or two', () => {
    const codexLike = group([
      '5.6-sol',
      'gpt-5.6-terra',
      'gpt-5.6-luna',
      'gpt-5.5',
      'gpt-5.4',
      'gpt-5.4-mini',
      'gpt-5.3-spark'
    ])

    const split = splitModelGroup(codexLike, 'gpt-5.5')
    expect(split.featured.map(m => m.value)).toEqual(codexLike.models.map(m => m.value))
    expect(split.more).toEqual([])
  })

  test('falls back to the first rows when nothing matches the catalog', () => {
    const large = group(['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8'])

    const split = splitModelGroup(large, 'm1')
    expect(split.featured.map(m => m.value)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5'])
    expect(split.more.map(m => m.value)).toEqual(['m6', 'm7', 'm8'])
  })
})
