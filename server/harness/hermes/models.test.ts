import { describe, expect, test } from 'bun:test'

import { hermesModels } from './models'
import type { AcpModelInfo } from '../acp/wire'

function catalog(infos: AcpModelInfo[], currentModelId?: string) {
  return hermesModels({ availableModels: infos, ...(currentModelId ? { currentModelId } : {}) })
}

function one(info: AcpModelInfo) {
  return catalog([info])[0]
}

describe('hermesModels', () => {
  test('hoists the provider to a group and strips it off the model name', () => {
    expect(
      one({
        modelId: 'nous:anthropic/claude-opus-5',
        name: 'Nous Portal · anthropic/claude-opus-5',
        description: 'Provider: Nous Portal'
      })
    ).toEqual({
      value: 'nous:anthropic/claude-opus-5',
      displayName: 'anthropic/claude-opus-5',
      group: 'Nous Portal',
      providerId: 'nous'
    })
  })

  test('groups a bare name by the provider its description names', () => {
    expect(
      one({
        modelId: 'custom:ollama-launch:gpt-oss:20b',
        name: 'gpt-oss:20b',
        description: 'Provider: Ollama'
      })
    ).toEqual({
      value: 'custom:ollama-launch:gpt-oss:20b',
      displayName: 'gpt-oss:20b',
      group: 'Ollama',
      providerId: 'ollama-launch'
    })
  })

  test("drops Hermes' own current-model marker from the group", () => {
    expect(
      one({
        modelId: 'xai-oauth:grok-build-0.1',
        name: 'xAI Grok OAuth (SuperGrok / Premium+) · grok-build-0.1',
        description: 'Provider: xAI Grok OAuth (SuperGrok / Premium+) • current'
      })
    ).toEqual({
      value: 'xai-oauth:grok-build-0.1',
      displayName: 'grok-build-0.1',
      group: 'xAI Grok OAuth (SuperGrok / Premium+)',
      providerId: 'xai-oauth'
    })
  })

  test('leaves rows the picker can already tell apart alone', () => {
    expect(one({ modelId: 'kimi-k2.7-code', name: 'kimi-k2.7-code' })).toEqual({
      value: 'kimi-k2.7-code',
      displayName: 'kimi-k2.7-code'
    })
    expect(one({ modelId: 'openai-api:gpt-5.4-mini' })).toEqual({
      value: 'openai-api:gpt-5.4-mini',
      displayName: 'openai-api:gpt-5.4-mini',
      providerId: 'openai-api'
    })
  })

  test('keeps a description that is prose rather than a provider label', () => {
    expect(
      one({ modelId: 'custom:local', name: 'local', description: 'Runs on this machine' })
    ).toEqual({
      value: 'custom:local',
      displayName: 'local',
      description: 'Runs on this machine',
      providerId: 'custom'
    })
  })
})

describe('hermesModels provider ids', () => {
  function providerId(modelId: string, name: string): string | undefined {
    return one({ modelId, name, description: 'Provider: Whatever' })?.providerId
  }

  // The cases a naive `modelId.split(':')[0]` gets wrong.
  test('unwraps the custom: namespace off a configured provider', () => {
    expect(providerId('custom:ollama-launch:gpt-oss:20b', 'gpt-oss:20b')).toBe('ollama-launch')
    expect(providerId('ollama-launch:gpt-oss:20b', 'gpt-oss:20b')).toBe('ollama-launch')
  })

  test('keeps custom as the provider when it is the provider', () => {
    expect(providerId('custom:kimi-k2.7-code', 'kimi-k2.7-code')).toBe('custom')
    expect(providerId('custom:qwen2.5:latest', 'qwen2.5:latest')).toBe('custom')
  })

  test('survives colons and slashes inside the model id', () => {
    expect(providerId('nous:anthropic/claude-opus-5', 'anthropic/claude-opus-5')).toBe('nous')
    expect(providerId('ollama-launch:kimi-k2.5:cloud', 'kimi-k2.5:cloud')).toBe('ollama-launch')
  })

  test('has none when the id is not namespaced at all', () => {
    expect(providerId('kimi-k2.7-code', 'kimi-k2.7-code')).toBeUndefined()
  })

  // The name is Hermes-authored, so it need not be a suffix of the id.
  test('falls back to the leading segment when the label does not match the id', () => {
    expect(providerId('nous:anthropic/claude-opus-5', 'Opus 5')).toBe('nous')
  })
})

describe('hermesModels deduping', () => {
  // Hermes lists a configured provider's models twice — under the provider id
  // and again namespaced under `custom:` — both routing to the same endpoint.
  const ollama: AcpModelInfo[] = [
    {
      modelId: 'ollama-launch:gpt-oss:20b',
      name: 'Ollama · gpt-oss:20b',
      description: 'Provider: Ollama'
    },
    {
      modelId: 'custom:ollama-launch:gpt-oss:20b',
      name: 'gpt-oss:20b',
      description: 'Provider: Ollama'
    }
  ]

  test('keeps the first of two ids for the same provider and model', () => {
    expect(catalog(ollama).map(m => m.value)).toEqual(['ollama-launch:gpt-oss:20b'])
  })

  // The default has to resolve to a row the picker shows, so the current
  // spelling wins the dedupe even when it comes second.
  test('keeps the current id when it is the duplicate spelling', () => {
    const models = catalog(ollama, 'custom:ollama-launch:gpt-oss:20b')

    expect(models.map(m => m.value)).toEqual(['default', 'custom:ollama-launch:gpt-oss:20b'])
    expect(models.map(m => m.resolvedModel)).toEqual([
      'custom:ollama-launch:gpt-oss:20b',
      'custom:ollama-launch:gpt-oss:20b'
    ])
  })

  test('keeps same-named models from different providers', () => {
    const models = catalog([
      {
        modelId: 'nous:x-ai/grok-4.5',
        name: 'Nous Portal · x-ai/grok-4.5',
        description: 'Provider: Nous Portal'
      },
      { modelId: 'xai-oauth:grok-4.5', name: 'xAI · grok-4.5', description: 'Provider: xAI' }
    ])

    expect(models.map(m => m.providerId)).toEqual(['nous', 'xai-oauth'])
  })
})

describe('hermesModels default', () => {
  const infos: AcpModelInfo[] = [
    {
      modelId: 'bedrock:us.anthropic.claude-sonnet-4-6',
      name: 'AWS Bedrock · us.anthropic.claude-sonnet-4-6',
      description: 'Provider: AWS Bedrock • current'
    },
    {
      modelId: 'openrouter:anthropic/claude-opus-4.6',
      name: 'OpenRouter · anthropic/claude-opus-4.6',
      description: 'Provider: OpenRouter'
    }
  ]

  // Same convention as the Claude harness: a synthetic `default` row whose
  // `resolvedModel` the picker matches against the concrete row's.
  test('prepends a default row resolving to currentModelId', () => {
    const models = catalog(infos, 'bedrock:us.anthropic.claude-sonnet-4-6')

    expect(models.map(m => [m.value, m.resolvedModel])).toEqual([
      ['default', 'bedrock:us.anthropic.claude-sonnet-4-6'],
      ['bedrock:us.anthropic.claude-sonnet-4-6', 'bedrock:us.anthropic.claude-sonnet-4-6'],
      ['openrouter:anthropic/claude-opus-4.6', undefined]
    ])
    expect(models[0].displayName).toBe('Default (from Hermes)')
  })

  test('adds no default row without a currentModelId the catalog lists', () => {
    const plain = ['bedrock:us.anthropic.claude-sonnet-4-6', 'openrouter:anthropic/claude-opus-4.6']
    expect(catalog(infos).map(m => m.value)).toEqual(plain)
    expect(catalog(infos, 'bedrock:missing').map(m => m.value)).toEqual(plain)
    expect(hermesModels({})).toEqual([])
  })
})
