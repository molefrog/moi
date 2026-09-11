import type {
  SessionConfigOption,
  SessionConfigSelectOption,
  SetSessionConfigOptionResponse
} from '@agentclientprotocol/sdk'

import type { Model } from '@/lib/types'

import type { AcpClient } from '../acp/client'
import type { AcpModelState, AcpNewSessionResult } from '../acp/wire'

function selectOption(options: SessionConfigOption[] | undefined, id: string) {
  const option = options?.find(option => option.id === id)
  return option?.type === 'select' ? option : undefined
}

function values(option: ReturnType<typeof selectOption>): SessionConfigSelectOption[] {
  return option?.options.flatMap(option => ('group' in option ? option.options : [option])) ?? []
}

// fx gives both provider and model the same category. Their exact ids carry
// the distinction; selecting the first category=model option picks a provider.
export function fxModelState(
  result: Pick<AcpNewSessionResult, 'configOptions' | 'models'>
): AcpModelState {
  const configOptions = result.configOptions ?? []
  const model = selectOption(configOptions, 'model')
  return {
    configOptions,
    configOptionsScope: selectOption(configOptions, 'provider')?.currentValue,
    ...(model ? { configOptionsByModel: { [model.currentValue]: configOptions } } : {}),
    currentModelId: model?.currentValue,
    defaultModelId: model?.currentValue,
    availableModels: values(model).map(option => ({
      modelId: option.value,
      name: option.name,
      ...(option.description ? { description: option.description } : {})
    }))
  }
}

export function fxModels(state: AcpModelState): Model[] {
  const provider = selectOption(state.configOptions, 'provider')?.currentValue
  const models = (state.availableModels ?? []).map((info): Model => {
    const options =
      state.configOptionsByModel?.[info.modelId] ??
      (info.modelId === state.currentModelId ? state.configOptions : undefined)
    const effort = selectOption(options, 'effort')
    const levels = values(effort).map(option => option.value)
    return {
      value: info.modelId,
      displayName: info.name || info.modelId,
      ...(info.description ? { description: info.description } : {}),
      ...(provider ? { providerId: provider } : {}),
      // Only expose choices this backend actually advertised for this model.
      ...(levels.length
        ? {
            supportsEffort: true,
            supportedEffortLevels: levels,
            // currentValue belongs to one chat. The shared catalog must not
            // present another chat's selected effort as a provider default.
            ...(levels.includes('auto') ? { defaultEffort: 'auto' } : {})
          }
        : {})
    }
  })
  const defaultModel = models.find(
    model => model.value === (state.defaultModelId ?? state.currentModelId)
  )
  return defaultModel
    ? [
        {
          ...defaultModel,
          value: 'default',
          displayName: 'Default (from fx)',
          resolvedModel: defaultModel.value
        },
        ...models
      ]
    : models
}

export async function applyFxSettings(
  client: Pick<AcpClient, 'rpc'>,
  sessionId: string,
  settings: { model?: string; effort?: string },
  state: AcpModelState
): Promise<AcpModelState> {
  let confirmed = state
  for (const [configId, value] of [
    ['model', settings.model],
    ['effort', settings.effort]
  ] as const) {
    if (!value || (configId === 'model' && value === 'default')) continue
    const option = selectOption(confirmed.configOptions, configId)
    if (!option) throw new Error(`fx does not expose ${configId} for the active model`)
    if (!values(option).some(option => option.value === value)) {
      throw new Error(`fx ${configId} is unavailable: ${value}`)
    }
    if (option.currentValue === value) continue
    const response = await client.rpc<SetSessionConfigOptionResponse>('session/set_config_option', {
      sessionId,
      configId,
      value
    })
    const next = fxModelState(response)
    if (selectOption(next.configOptions, configId)?.currentValue !== value) {
      throw new Error(`fx did not confirm the requested ${configId}: ${value}`)
    }
    confirmed = { ...next, defaultModelId: state.defaultModelId ?? state.currentModelId }
  }
  return confirmed
}
