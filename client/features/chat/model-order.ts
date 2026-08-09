import type { Model, WorkspaceType } from '@/lib/types'

export const DEFAULT_EFFORT = 'high'

const ANTHROPIC_MODEL_FAMILY_ORDER = ['fable', 'opus', 'sonnet', 'haiku'] as const

type ModelComparator = (a: Model, b: Model) => number

function anthropicModelFamilyRank(model: Model): number | undefined {
  const key = model.resolvedModel ?? model.value
  const rank = ANTHROPIC_MODEL_FAMILY_ORDER.findIndex(
    family => key === family || key.startsWith(`${family}[`) || key.includes(`-${family}-`)
  )

  return rank === -1 ? undefined : rank
}

function compareOptionalRanks(a: number | undefined, b: number | undefined): number {
  if (a === undefined && b === undefined) return 0
  if (a === undefined) return -1
  if (b === undefined) return 1
  return a - b
}

function compareAnthropicModels(a: Model, b: Model): number {
  return compareOptionalRanks(anthropicModelFamilyRank(a), anthropicModelFamilyRank(b))
}

const PROVIDER_MODEL_COMPARATORS: Partial<Record<WorkspaceType, ModelComparator>> = {
  'claude-code': compareAnthropicModels
}

function stableSortModels(models: Model[], compare: ModelComparator): Model[] {
  return models
    .map((model, index) => ({ model, index }))
    .sort((a, b) => compare(a.model, b.model) || a.index - b.index)
    .map(({ model }) => model)
}

// `modelDefault` is the provider's own resolved default for this model
// (OpenClaw `thinkingDefault`, which is `low` on one model and `off` on the
// next). It outranks the app-wide DEFAULT_EFFORT but never the user's pick.
export function resolveDisplayedEffort(
  levels: readonly string[],
  selectedEffort: string | undefined,
  modelDefault?: string
): string | undefined {
  if (selectedEffort && levels.includes(selectedEffort)) return selectedEffort
  if (modelDefault && levels.includes(modelDefault)) return modelDefault
  if (levels.includes(DEFAULT_EFFORT)) return DEFAULT_EFFORT
  return levels[levels.length - 1]
}

export function resolveEffortIndex(
  levels: readonly string[],
  selectedEffort: string | undefined,
  modelDefault?: string
): number {
  const displayedEffort = resolveDisplayedEffort(levels, selectedEffort, modelDefault)
  return displayedEffort ? levels.indexOf(displayedEffort) : -1
}

export function hasEffortChoice(levels: readonly string[]): boolean {
  return levels.length > 1
}

export function resolveFastMode(model: Model, selectedFastMode: boolean | undefined): boolean {
  if (model.supportsFastMode !== true) return false
  return selectedFastMode ?? model.defaultFastMode ?? false
}

export function sortModelsByProviderOrder(models: Model[], provider: WorkspaceType): Model[] {
  const compare = PROVIDER_MODEL_COMPARATORS[provider]
  return compare ? stableSortModels(models, compare) : models
}
