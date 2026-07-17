import type { Model, WorkspaceType } from '@/lib/types'

export const MODEL_ORDER = {
  'claude-code': [
    'claude-fable-5',
    'claude-opus-4-8',
    'claude-opus-4-8[1m]',
    'claude-sonnet-5',
    'claude-haiku-4-5-20251001'
  ],
  codex: [],
  openclaw: []
} as const satisfies Record<WorkspaceType, readonly string[]>

function modelOrderKey(model: Model): string {
  return model.resolvedModel ?? model.value
}

export function sortModelsByProviderOrder(models: Model[], provider: WorkspaceType): Model[] {
  const configuredOrder: readonly string[] = MODEL_ORDER[provider]
  const rank = new Map<string, number>(configuredOrder.map((model, index) => [model, index]))

  return models
    .map((model, index) => ({ model, index, rank: rank.get(modelOrderKey(model)) }))
    .sort((a, b) => {
      if (a.rank === undefined && b.rank === undefined) return a.index - b.index
      if (a.rank === undefined) return -1
      if (b.rank === undefined) return 1
      return a.rank - b.rank || a.index - b.index
    })
    .map(({ model }) => model)
}
