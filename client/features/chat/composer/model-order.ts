import { FEATURED_MODELS_CAP, featuredModels } from '@/lib/frontier-models'
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

export type ModelGroup = { label: string; models: Model[] }

// Picker sections. Backends that group their catalog (Hermes, by upstream
// provider) get one section per `group`, in first-appearance order; everything
// else stays a single "Models" section.
export function groupModels(models: readonly Model[], fallbackLabel: string): ModelGroup[] {
  const groups: ModelGroup[] = []
  for (const model of models) {
    const label = model.group ?? fallbackLabel
    const existing = groups.find(group => group.label === label)
    if (existing) existing.models.push(model)
    else groups.push({ label, models: [model] })
  }
  return groups
}

// A "More models" submenu that hides fewer rows than this costs more than it
// saves — show the whole group inline instead. Small groups (local Ollama,
// where every model was pulled by hand) never split; neither does a group the
// curation would only trim by a row or two (Codex's 7-model list).
const MIN_SPLIT_OVERFLOW = 3

export type SplitModelGroup = { label: string; featured: Model[]; more: Model[] }

// Curated view of one picker section. Groups that merge a large upstream
// catalog (Hermes providers) feature only frontier-family models; the rest
// move to a "More models" submenu, in backend order. A group with no frontier
// match falls back to its first rows so it is never submenu-only, and the
// selected model is always featured so the checked row cannot hide in the
// overflow.
export function splitModelGroup(group: ModelGroup, currentValue: string): SplitModelGroup {
  let featured = featuredModels(group.models)
  if (featured.length === 0) featured = group.models.slice(0, FEATURED_MODELS_CAP)

  const featuredValues = new Set(featured.map(model => model.value))
  const current = group.models.find(model => model.value === currentValue)
  if (current && !featuredValues.has(current.value)) {
    featured = [...featured, current]
    featuredValues.add(current.value)
  }

  const more = group.models.filter(model => !featuredValues.has(model.value))
  if (more.length < MIN_SPLIT_OVERFLOW) {
    return { label: group.label, featured: group.models, more: [] }
  }
  return { label: group.label, featured, more }
}
