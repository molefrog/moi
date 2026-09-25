import type {
  SessionConfigOption,
  SessionConfigSelectOption,
  SetSessionConfigOptionResponse
} from '@agentclientprotocol/sdk'

import type { Model, SessionConfig } from '@/lib/types'

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

// Gateway catalogs name each model `<vendor>/<model>`, a few hundred of them.
// The picker lists the model name under a vendor heading instead.
const VENDORS: Record<string, string> = {
  'arcee-ai': 'Arcee AI',
  bytedance: 'ByteDance',
  deepseek: 'DeepSeek',
  minimax: 'MiniMax',
  moonshotai: 'Moonshot AI',
  nvidia: 'NVIDIA',
  openai: 'OpenAI',
  stepfun: 'StepFun',
  thinkingmachines: 'Thinking Machines',
  xai: 'xAI',
  zai: 'Z.ai'
}

// Other vendors: `inference-net` → "Inference net".
function vendorLabel(slug: string): string {
  const known = VENDORS[slug]
  if (known) return known
  const words = slug.replace(/-/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function modelLabel(info: {
  modelId: string
  name?: string
}): Pick<Model, 'displayName' | 'group'> {
  const slash = info.modelId.indexOf('/')
  if (slash <= 0 || slash === info.modelId.length - 1)
    return { displayName: info.name || info.modelId }
  const vendor = info.modelId.slice(0, slash)
  return {
    // A name fx chose itself is kept as is.
    displayName:
      !info.name || info.name === info.modelId ? info.modelId.slice(slash + 1) : info.name,
    group: vendorLabel(vendor)
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
      ...modelLabel(info),
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
        : // Known selectors without effort: no picker, and nothing to probe.
          options
          ? { supportsEffort: false }
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
          group: undefined,
          resolvedModel: defaultModel.value
        },
        ...models
      ]
    : models
}

export function fxSessionConfig(state: AcpModelState): SessionConfig {
  const effort = selectOption(state.configOptions, 'effort')
  return {
    ...(state.currentModelId ? { model: state.currentModelId } : {}),
    ...(effort ? { effort: effort.currentValue } : {})
  }
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
