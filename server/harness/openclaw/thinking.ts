// Per-model thinking (reasoning-effort) profiles, learned from the gateway.
//
// OpenClaw resolves the thinking-level menu PER MODEL, not gateway-wide. The
// dist carries per-provider policies (`provider-claude-thinking`,
// `moonshot-thinking`, …), and `sessions.patch { thinkingLevel }` validates
// against the session's resolved model, rejecting anything outside its set:
//
//   thinkingLevel "adaptive" is not supported for openai/gpt-5.6-sol
//     (use off|minimal|low|medium|high|xhigh|max|ultra)
//
// Verified live against gateway 2026.7.1-2: `adaptive` is Claude-only, `ultra`
// is OpenAI-only (and absent from gpt-5.6-luna), and the ollama models drop
// `minimal`/`xhigh` entirely. Defaults differ per model too (`low` / `medium` /
// `off`), so `thinkingDefault` is not a constant either.
//
// Why a learned map instead of an RPC: `models.list` carries only
// `reasoning: boolean` (no levels), and there is no per-model thinking method —
// `models.get`/`models.capabilities` don't exist, and `models.list` hard-rejects
// an `agentId` param. Every SESSION ROW, however, carries the resolved menu for
// the model it's on (`thinkingOptions` + `thinkingDefault`), and rows arrive
// constantly: `sessions.list` during discovery, plus one embedded in every live
// event frame. We harvest those and the picker reads this map.
//
// A model nobody holds a session for falls back to OPENCLAW_FALLBACK_THINKING_
// LEVELS — narrow but valid everywhere, which is the right way to be wrong: an
// unlisted level costs the user a choice, an invalid one costs them the send.

export type OpenClawThinkingProfile = {
  levels: string[]
  // The gateway's `thinkingDefault` for this model — what a fresh session runs
  // at when nobody has picked. Varies by model, so the picker seeds from it.
  default?: string
}

// The intersection of every menu observed across the anthropic / openai /
// ollama providers on a live gateway. Used only for models we've never seen a
// session row for; the moment one appears the real menu replaces it.
export const OPENCLAW_FALLBACK_THINKING_LEVELS = ['off', 'low', 'medium', 'high']

// Keyed by `provider/model` — the same ref `sessions.patch { model }` takes and
// `models.list` rows resolve to, so the picker can look up by a Model `value`.
const profiles = new Map<string, OpenClawThinkingProfile>()

// A session row's thinking menu, as broadcast by both supported lines.
// `thinkingOptions` is the flat list; `thinkingLevels` the labelled form. Read
// both — the flat one is what every 2026.7.x row carries, the labelled one is
// the safety net if a line ever ships only that.
export type OpenClawThinkingRow = {
  model?: unknown
  modelProvider?: unknown
  thinkingOptions?: unknown
  thinkingLevels?: unknown
  thinkingDefault?: unknown
}

// `provider/model` from a row, or null when the row predates its first run and
// carries no model yet. Rows already report `model` unqualified plus a separate
// `modelProvider`; a model id that somehow arrives qualified is passed through.
export function openClawModelRef(row: OpenClawThinkingRow): string | null {
  const model = typeof row.model === 'string' ? row.model.trim() : ''
  if (!model) return null
  if (model.includes('/')) return model
  const provider = typeof row.modelProvider === 'string' ? row.modelProvider.trim() : ''
  return provider ? `${provider}/${model}` : null
}

function readLevels(row: OpenClawThinkingRow): string[] | null {
  if (Array.isArray(row.thinkingOptions)) {
    const flat = row.thinkingOptions.filter((l): l is string => typeof l === 'string' && !!l)
    if (flat.length > 0) return flat
  }
  if (Array.isArray(row.thinkingLevels)) {
    const labelled = row.thinkingLevels
      .map(l => (l && typeof l === 'object' ? (l as { id?: unknown }).id : undefined))
      .filter((id): id is string => typeof id === 'string' && !!id)
    if (labelled.length > 0) return labelled
  }
  return null
}

// Harvest a row's menu. Cheap and idempotent — safe to call on every row of
// every `sessions.list` and on the row embedded in every live frame.
export function recordOpenClawThinkingProfile(row: OpenClawThinkingRow): void {
  const ref = openClawModelRef(row)
  if (!ref) return
  const levels = readLevels(row)
  if (!levels) return
  const fallbackDefault = profiles.get(ref)?.default
  const rowDefault = typeof row.thinkingDefault === 'string' ? row.thinkingDefault : undefined
  const resolved = rowDefault ?? fallbackDefault
  profiles.set(ref, { levels, ...(resolved ? { default: resolved } : {}) })
}

export function recordOpenClawThinkingProfiles(rows: OpenClawThinkingRow[]): void {
  for (const row of rows) recordOpenClawThinkingProfile(row)
}

// A model's menu, or null when no session row has reported one yet (the picker
// then falls back to OPENCLAW_FALLBACK_THINKING_LEVELS). Keyed by the exact
// `provider/model` ref: `sessions.list` echoes back the provider of the ref
// that was patched, so what the picker sends is what the rows come back under.
export function openClawThinkingProfile(modelRef: string): OpenClawThinkingProfile | null {
  return profiles.get(modelRef) ?? null
}

export function hasOpenClawThinkingProfiles(): boolean {
  return profiles.size > 0
}

// Tests only — the map is process-global by design (one gateway per process).
export function resetOpenClawThinkingProfiles(): void {
  profiles.clear()
}

// Self-healing: a rejected `thinkingLevel` patch names the model's real menu in
// its message, so we learn the correct set from the failure itself and the
// picker stops offering the bad level. Only the model-scoped rejection is
// parsed — the generic `invalid thinkingLevel (…)` validator fires before model
// resolution, so its list is not authoritative for the model.
const THINKING_REJECTION = /thinkingLevel .* is not supported for (\S+) \(use ([^)]+)\)/

export function parseOpenClawThinkingRejection(
  error: unknown
): { modelRef: string; levels: string[] } | null {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  const match = THINKING_REJECTION.exec(message)
  if (!match) return null
  const [, modelRef, list] = match
  if (!modelRef || !list) return null
  const levels = list
    .split('|')
    .map(l => l.trim())
    .filter(Boolean)
  if (levels.length === 0) return null
  return { modelRef, levels }
}

// Learn from a rejection and persist the corrected menu, keeping whatever
// default we already knew for that model.
export function recordOpenClawThinkingRejection(error: unknown): boolean {
  const parsed = parseOpenClawThinkingRejection(error)
  if (!parsed) return false
  const existing = profiles.get(parsed.modelRef)
  const stillValid = existing?.default && parsed.levels.includes(existing.default)
  profiles.set(parsed.modelRef, {
    levels: parsed.levels,
    ...(stillValid ? { default: existing?.default } : {})
  })
  return true
}
