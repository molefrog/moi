import { describe, expect, test } from 'bun:test'
import type { SessionConfigOption } from '@agentclientprotocol/sdk'

import type { AcpClient } from '../acp/client'
import { cacheAcpModelState, clearAcpModelCache, peekAcpModelState } from '../acp/model-state'
import { applyFxSettings, fxModels, fxModelState } from './models'

function options(model = 'openai/gpt-5', effort = 'auto'): SessionConfigOption[] {
  return [
    {
      id: 'provider',
      name: 'Provider',
      category: 'model',
      type: 'select',
      currentValue: 'gateway',
      options: [{ value: 'gateway', name: 'Gateway' }]
    },
    {
      id: 'model',
      name: 'Model',
      category: 'model',
      type: 'select',
      currentValue: model,
      options: [
        {
          group: 'models',
          name: 'Models',
          options: [
            { value: 'openai/gpt-5', name: 'GPT-5' },
            { value: 'anthropic/claude-sonnet-5', name: 'Sonnet 5' }
          ]
        }
      ]
    },
    {
      id: 'effort',
      name: 'Reasoning effort',
      category: 'thought_level',
      type: 'select',
      currentValue: effort,
      options: [
        { value: 'auto', name: 'Default' },
        { value: 'high', name: 'High' }
      ]
    }
  ]
}

function clientWith(
  handler: (method: string, params: Record<string, unknown> | undefined) => unknown
): Pick<AcpClient, 'rpc'> {
  return {
    rpc: async <T>(method: string, params?: Record<string, unknown>) => handler(method, params) as T
  }
}

describe('fx model configuration', () => {
  test('uses the exact model selector despite provider sharing its category', () => {
    const state = fxModelState({ configOptions: options() })
    expect(state.currentModelId).toBe('openai/gpt-5')
    expect(state.availableModels?.map(model => model.modelId)).toEqual([
      'openai/gpt-5',
      'anthropic/claude-sonnet-5'
    ])
    const models = fxModels(state)
    expect(models[0]).toMatchObject({
      value: 'default',
      resolvedModel: 'openai/gpt-5',
      supportedEffortLevels: ['auto', 'high']
    })
    expect(models[2]?.supportedEffortLevels).toBeUndefined()
  })

  test('does not invent effort support when the agent omits it', () => {
    const models = fxModels(
      fxModelState({ configOptions: options().filter(option => option.id !== 'effort') })
    )
    expect(models.every(model => !model.supportsEffort)).toBe(true)
  })

  test('rejects an unadvertised model before issuing an RPC', async () => {
    let calls = 0
    const client = clientWith(() => {
      calls++
      return {}
    })
    await expect(
      applyFxSettings(
        client,
        's',
        { model: 'not-a-model' },
        fxModelState({ configOptions: options() })
      )
    ).rejects.toThrow('unavailable')
    expect(calls).toBe(0)
  })

  test('switches model then validates effort against the returned catalog', async () => {
    const calls: unknown[] = []
    const client = clientWith((method, params) => {
      calls.push({ method, params })
      return {
        configOptions: options(
          'anthropic/claude-sonnet-5',
          params?.configId === 'effort' ? 'high' : 'auto'
        )
      }
    })
    const state = await applyFxSettings(
      client,
      's',
      { model: 'anthropic/claude-sonnet-5', effort: 'high' },
      fxModelState({ configOptions: options() })
    )
    expect(state.currentModelId).toBe('anthropic/claude-sonnet-5')
    expect(calls).toEqual([
      {
        method: 'session/set_config_option',
        params: { sessionId: 's', configId: 'model', value: 'anthropic/claude-sonnet-5' }
      },
      {
        method: 'session/set_config_option',
        params: { sessionId: 's', configId: 'effort', value: 'high' }
      }
    ])
  })

  test('does not accept an acknowledged selection that was not applied', async () => {
    await expect(
      applyFxSettings(
        clientWith(() => ({ configOptions: options() })),
        's',
        { effort: 'high' },
        fxModelState({ configOptions: options() })
      )
    ).rejects.toThrow('did not confirm')
  })

  test('preserves the original default while switching models and returning to it', async () => {
    const calls: Record<string, unknown>[] = []
    const client = clientWith((_method, params) => {
      calls.push(params ?? {})
      return { configOptions: options(String(params?.value)) }
    })
    const original = fxModelState({ configOptions: options() })
    const switched = await applyFxSettings(
      client,
      's',
      { model: 'anthropic/claude-sonnet-5' },
      original
    )
    expect(switched.currentModelId).toBe('anthropic/claude-sonnet-5')
    expect(switched.defaultModelId).toBe('openai/gpt-5')
    const rows = fxModels(switched)
    expect(rows[0]).toMatchObject({ value: 'default', resolvedModel: 'openai/gpt-5' })
    expect(rows[0]?.supportedEffortLevels).toBeUndefined()
    expect(
      rows.find(row => row.value === 'anthropic/claude-sonnet-5')?.supportedEffortLevels
    ).toEqual(['auto', 'high'])

    // The session layer resolves its default choice to the original concrete id.
    const restored = await applyFxSettings(
      client,
      's',
      { model: switched.defaultModelId },
      switched
    )
    expect(restored.currentModelId).toBe('openai/gpt-5')
    expect(restored.defaultModelId).toBe('openai/gpt-5')
    expect(calls.map(call => call.value)).toEqual(['anthropic/claude-sonnet-5', 'openai/gpt-5'])
  })

  test('does not reuse the previous model effort catalog after switching', async () => {
    const client = clientWith(() => ({
      configOptions: options('anthropic/claude-sonnet-5').filter(option => option.id !== 'effort')
    }))
    await expect(
      applyFxSettings(
        client,
        's',
        { model: 'anthropic/claude-sonnet-5', effort: 'high' },
        fxModelState({ configOptions: options() })
      )
    ).rejects.toThrow('does not expose effort')
  })

  test('retains each known model effort catalog as different warm chats update the cache', async () => {
    const path = `/fx-model-cache-test/${crypto.randomUUID()}`
    const gptOptions = options().map(option =>
      option.id === 'effort' && option.type === 'select'
        ? {
            ...option,
            options: [
              { value: 'auto', name: 'Default' },
              { value: 'low', name: 'Low' }
            ]
          }
        : option
    )
    const gpt = fxModelState({ configOptions: gptOptions })
    const sonnet = {
      ...fxModelState({ configOptions: options('anthropic/claude-sonnet-5', 'high') }),
      defaultModelId: 'openai/gpt-5'
    }
    const readModels = async () => fxModels((await peekAcpModelState(path, 'account-1', 'fx'))!)
    try {
      cacheAcpModelState(path, gpt, 'account-1', 'fx')
      cacheAcpModelState(path, sonnet, 'account-1', 'fx')
      // Returning to an already-live chat does not reload or switch its model.
      // Both choices must remain known even after the other chat is updated.
      cacheAcpModelState(path, gpt, 'account-1', 'fx')
      const models = await readModels()
      expect(models[0]).toMatchObject({ value: 'default', resolvedModel: 'openai/gpt-5' })
      expect(models.find(model => model.value === 'openai/gpt-5')?.supportedEffortLevels).toEqual([
        'auto',
        'low'
      ])
      expect(
        models.find(model => model.value === 'anthropic/claude-sonnet-5')?.supportedEffortLevels
      ).toEqual(['auto', 'high'])
      expect(models.find(model => model.value === 'anthropic/claude-sonnet-5')?.defaultEffort).toBe(
        'auto'
      )

      // A fresh response explicitly omitting effort replaces its old snapshot.
      cacheAcpModelState(
        path,
        {
          ...fxModelState({
            configOptions: options('anthropic/claude-sonnet-5').filter(
              option => option.id !== 'effort'
            )
          }),
          defaultModelId: 'openai/gpt-5'
        },
        'account-1',
        'fx'
      )
      const updated = await readModels()
      expect(
        updated.find(model => model.value === 'anthropic/claude-sonnet-5')?.supportsEffort
      ).toBeUndefined()
      expect(updated.find(model => model.value === 'openai/gpt-5')?.supportedEffortLevels).toEqual([
        'auto',
        'low'
      ])
    } finally {
      clearAcpModelCache(path, 'fx')
    }
  })
})
