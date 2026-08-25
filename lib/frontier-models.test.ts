import { describe, expect, test } from 'bun:test'

import { FEATURED_MODELS_CAP, featuredModels, normalizeModelKey } from './frontier-models'
import type { Model } from './types'

function model(value: string, extra: Partial<Model> = {}): Model {
  return { value, displayName: value, ...extra }
}

describe('normalizeModelKey', () => {
  test('drops the vendor prefix and unifies separators', () => {
    expect(normalizeModelKey('anthropic/claude-opus-4.8')).toBe('claude-opus-4-8')
    expect(normalizeModelKey('claude-opus-4-8')).toBe('claude-opus-4-8')
    expect(normalizeModelKey('gpt-oss:20b')).toBe('gpt-oss-20b')
    expect(normalizeModelKey('Kimi K3')).toBe('kimi-k3')
  })
})

describe('featuredModels', () => {
  test('orders picks by family rank, not backend order', () => {
    const models = [
      model('nous:deepseek/deepseek-v4'),
      model('nous:x-ai/grok-4.5'),
      model('nous:openai/gpt-5.4'),
      model('nous:google/gemini-3-pro'),
      model('nous:anthropic/claude-opus-5')
    ]

    expect(featuredModels(models).map(item => item.value)).toEqual([
      'nous:anthropic/claude-opus-5',
      'nous:openai/gpt-5.4',
      'nous:google/gemini-3-pro',
      'nous:x-ai/grok-4.5',
      'nous:deepseek/deepseek-v4'
    ])
  })

  test('claude tiers occupy separate family slots', () => {
    const models = [
      model('claude-haiku-4-5'),
      model('claude-sonnet-5'),
      model('claude-opus-5'),
      model('gemini-3-pro'),
      model('kimi-k3')
    ]

    expect(featuredModels(models).map(item => item.value)).toEqual([
      'claude-opus-5',
      'gemini-3-pro',
      'claude-sonnet-5',
      'kimi-k3',
      'claude-haiku-4-5'
    ])
  })

  test('the newest release represents its family, whatever the backend order', () => {
    const dates = {
      'claude-opus-4': '2025-05-22',
      'claude-opus-4-8': '2026-05-28',
      'claude-opus-5-1': '2026-08-20',
      'claude-opus-5': '2026-07-24'
    }
    const models = [
      model('anthropic/claude-opus-4'),
      model('anthropic/claude-opus-5'),
      model('anthropic/claude-opus-5.1'),
      model('anthropic/claude-opus-4.8')
    ]

    expect(featuredModels(models, 1, dates).map(item => item.value)).toEqual([
      'anthropic/claude-opus-5.1'
    ])
  })

  test('an id the snapshot has never seen counts as newest', () => {
    const dates = { 'claude-opus-5': '2026-07-24' }
    const models = [model('anthropic/claude-opus-5'), model('anthropic/claude-opus-6')]

    expect(featuredModels(models, 1, dates).map(item => item.value)).toEqual([
      'anthropic/claude-opus-6'
    ])
  })

  test('demoted tiers never outrank the flagship, even when newer', () => {
    const dates = { 'gpt-5-4': '2026-06-01', 'gpt-5-4-mini': '2026-06-15' }
    const models = [model('openai/gpt-5.4-mini'), model('openai/gpt-5.4')]

    expect(featuredModels(models, 1, dates).map(item => item.value)).toEqual(['openai/gpt-5.4'])
  })

  test('fills remaining slots with runner-up variants after every family has one', () => {
    const dates = { 'claude-opus-5': '2026-07-24', 'claude-opus-4-8': '2026-05-28' }
    const models = [model('claude-opus-4-8'), model('claude-opus-5'), model('gemini-3-pro')]

    expect(featuredModels(models, FEATURED_MODELS_CAP, dates).map(item => item.value)).toEqual([
      'claude-opus-5',
      'claude-opus-4-8',
      'gemini-3-pro'
    ])
  })

  test('matches display name and resolved model, not just the id', () => {
    const models = [
      model('nous-forge-default', { displayName: 'Kimi K3 (fast)' }),
      model('alias-a', { resolvedModel: 'claude-opus-5' }),
      model('totally-unknown')
    ]

    expect(featuredModels(models).map(item => item.value)).toEqual([
      'alias-a',
      'nous-forge-default'
    ])
  })

  test('a demoted tier never claims a slot ahead of another family', () => {
    const models = [model('deepseek-v4-flash:cloud'), model('kimi-k3:cloud')]

    expect(featuredModels(models, 1).map(item => item.value)).toEqual(['kimi-k3:cloud'])
  })

  test('non-chat modality variants rank below chat models', () => {
    const dates = { 'grok-4-3': '2025-11-01', 'grok-imagine-image-2-0': '2026-06-01' }
    const models = [model('grok-imagine-image-2.0'), model('grok-4.3')]

    expect(featuredModels(models, 1, dates).map(item => item.value)).toEqual(['grok-4.3'])
  })

  test("does not treat Ollama's :latest tag as a demoted tier", () => {
    const dates = { 'deepseek-v4-flash': '2026-05-01' }
    const models = [model('deepseek-v4-flash'), model('deepseek-r1:latest')]

    expect(featuredModels(models, 1, dates).map(item => item.value)).toEqual(['deepseek-r1:latest'])
  })

  test('keeps gpt-oss separate from the gpt family', () => {
    const models = [model('gpt-oss:20b'), model('gpt-5.4')]

    expect(featuredModels(models, 1).map(item => item.value)).toEqual(['gpt-5.4'])
  })

  test('returns empty when nothing matches', () => {
    expect(featuredModels([model('local-llm'), model('smollm3')])).toEqual([])
  })

  // Against the committed snapshot: the exact case that motivated release-date
  // ranking — an older Opus listed before a newer one.
  test('ranks real Opus variants by the snapshot', () => {
    const models = [model('anthropic/claude-opus-4.8'), model('anthropic/claude-opus-5')]

    expect(featuredModels(models, 1).map(item => item.value)).toEqual(['anthropic/claude-opus-5'])
  })
})
