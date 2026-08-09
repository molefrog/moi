// Per-model thinking menus. Every fixture below is a verbatim `thinkingOptions`
// / `thinkingDefault` pair captured from live `sessions.list` rows on gateway
// 2026.7.1-2, and every rejection string is the gateway's own wording from a
// live `sessions.patch` that was refused.
import { beforeEach, describe, expect, test } from 'bun:test'

import {
  OPENCLAW_FALLBACK_THINKING_LEVELS,
  hasOpenClawThinkingProfiles,
  openClawModelRef,
  openClawThinkingProfile,
  parseOpenClawThinkingRejection,
  recordOpenClawThinkingProfile,
  recordOpenClawThinkingProfiles,
  recordOpenClawThinkingRejection,
  resetOpenClawThinkingProfiles
} from './thinking'

// Real rows, verbatim from the wire.
const ROWS = [
  {
    key: 'agent:main:main',
    modelProvider: 'openai',
    model: 'gpt-5.6-sol',
    thinkingOptions: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
    thinkingDefault: 'low'
  },
  {
    key: 'agent:main:a',
    modelProvider: 'openai',
    model: 'gpt-5.6-luna',
    thinkingOptions: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
    thinkingDefault: 'medium'
  },
  {
    key: 'agent:main:b',
    modelProvider: 'anthropic',
    model: 'claude-opus-4-8',
    thinkingOptions: ['off', 'minimal', 'low', 'medium', 'adaptive', 'high', 'xhigh', 'max'],
    thinkingDefault: 'off'
  },
  {
    key: 'agent:main:c',
    modelProvider: 'ollama',
    model: 'deepseek-v4-flash:cloud',
    thinkingOptions: ['off', 'low', 'medium', 'high', 'max'],
    thinkingDefault: 'off'
  }
]

beforeEach(() => resetOpenClawThinkingProfiles())

describe('per-model menus (the thing a single static list got wrong)', () => {
  test('each model keeps its own levels and its own default', () => {
    recordOpenClawThinkingProfiles(ROWS)

    // `ultra` is OpenAI-only — and not even on every OpenAI model.
    expect(openClawThinkingProfile('openai/gpt-5.6-sol')?.levels).toContain('ultra')
    expect(openClawThinkingProfile('openai/gpt-5.6-luna')?.levels).not.toContain('ultra')
    // `adaptive` is Claude-only.
    expect(openClawThinkingProfile('anthropic/claude-opus-4-8')?.levels).toContain('adaptive')
    expect(openClawThinkingProfile('openai/gpt-5.6-sol')?.levels).not.toContain('adaptive')
    // ollama drops `minimal` and `xhigh` entirely.
    expect(openClawThinkingProfile('ollama/deepseek-v4-flash:cloud')?.levels).toEqual([
      'off',
      'low',
      'medium',
      'high',
      'max'
    ])
    // Defaults differ per model, so they can't be a constant either.
    expect(openClawThinkingProfile('openai/gpt-5.6-sol')?.default).toBe('low')
    expect(openClawThinkingProfile('openai/gpt-5.6-luna')?.default).toBe('medium')
    expect(openClawThinkingProfile('anthropic/claude-opus-4-8')?.default).toBe('off')
  })

  test('the fallback menu is valid on every model observed', () => {
    for (const row of ROWS) {
      for (const level of OPENCLAW_FALLBACK_THINKING_LEVELS) {
        expect(row.thinkingOptions).toContain(level)
      }
    }
  })

  test('an unknown model has no profile, so the caller falls back', () => {
    recordOpenClawThinkingProfiles(ROWS)
    expect(openClawThinkingProfile('openai/never-seen')).toBeNull()
  })

  // On 2026.7.2-beta.7 `models.list` stopped reporting `reasoning` for the
  // OpenAI models while their session rows still advertise the full menu.
  // `getOpenClawModels` treats a learned menu with a choice in it as proof the
  // model reasons, so the effort picker survives that drift.
  test('a learned menu with more than one level stands in for the catalog flag', () => {
    recordOpenClawThinkingProfiles(ROWS)
    const profile = openClawThinkingProfile('openai/gpt-5.6-sol')
    expect(profile?.levels.length).toBeGreaterThan(1)
  })
})

describe('harvesting rows', () => {
  test('reads the labelled `thinkingLevels` form when the flat list is absent', () => {
    recordOpenClawThinkingProfile({
      modelProvider: 'ollama',
      model: 'kimi-k3:cloud',
      thinkingLevels: [{ id: 'off' }, { id: 'low' }, { id: 'medium' }],
      thinkingDefault: 'off'
    })
    expect(openClawThinkingProfile('ollama/kimi-k3:cloud')?.levels).toEqual([
      'off',
      'low',
      'medium'
    ])
  })

  test('a row with no model yet is ignored (never-run sessions omit it)', () => {
    recordOpenClawThinkingProfile({ thinkingOptions: ['off', 'high'] })
    expect(hasOpenClawThinkingProfiles()).toBe(false)
  })

  test('a row with a model but no menu does not erase what we know', () => {
    recordOpenClawThinkingProfiles(ROWS)
    recordOpenClawThinkingProfile({ modelProvider: 'openai', model: 'gpt-5.6-sol' })
    expect(openClawThinkingProfile('openai/gpt-5.6-sol')?.levels).toContain('ultra')
  })

  test('a later row without a default keeps the default already learned', () => {
    recordOpenClawThinkingProfile(ROWS[0]!)
    recordOpenClawThinkingProfile({
      modelProvider: 'openai',
      model: 'gpt-5.6-sol',
      thinkingOptions: ['off', 'low', 'high']
    })
    const profile = openClawThinkingProfile('openai/gpt-5.6-sol')
    expect(profile?.levels).toEqual(['off', 'low', 'high'])
    expect(profile?.default).toBe('low')
  })

  test('the same model id under two providers stays two profiles', () => {
    // Live: openai/kimi-k3:cloud and ollama/kimi-k3:cloud advertise
    // different menus, so the ref must carry the provider.
    recordOpenClawThinkingProfile({
      modelProvider: 'openai',
      model: 'kimi-k3:cloud',
      thinkingOptions: ['off', 'minimal', 'low', 'medium', 'high']
    })
    recordOpenClawThinkingProfile({
      modelProvider: 'ollama',
      model: 'kimi-k3:cloud',
      thinkingOptions: ['off', 'low', 'medium', 'high', 'max']
    })
    expect(openClawThinkingProfile('openai/kimi-k3:cloud')?.levels).toContain('minimal')
    expect(openClawThinkingProfile('ollama/kimi-k3:cloud')?.levels).toContain('max')
  })

  // Rows come back under the provider of the ref that was patched (verified
  // live on 2026.7.1 for `anthropic/`, `claude-cli/` and `ollama-cloud/`), so a
  // lookup is an exact match on the ref and nothing else.
  test('a ref nobody has a row for answers null, not a guess', () => {
    recordOpenClawThinkingProfile({
      modelProvider: 'claude-cli',
      model: 'claude-opus-5',
      thinkingOptions: ['off', 'minimal', 'low', 'medium', 'adaptive', 'high', 'xhigh', 'max'],
      thinkingDefault: 'high'
    })
    expect(openClawThinkingProfile('claude-cli/claude-opus-5')?.levels).toContain('adaptive')
    // A different provider is a different catalog entry — the picker falls back
    // to the safe intersection rather than borrowing this menu.
    expect(openClawThinkingProfile('anthropic/claude-opus-5')).toBeNull()
  })

  // The applied-model cache compares the picker's catalog ref against the ref
  // the wire reports back. Getting this wrong costs a redundant
  // `sessions.patch { model }` on every send, and each one is a config write
  // that can supersede the run being admitted.

  test('openClawModelRef joins provider and model, passing through a qualified id', () => {
    expect(openClawModelRef({ modelProvider: 'openai', model: 'gpt-5.6-sol' })).toBe(
      'openai/gpt-5.6-sol'
    )
    expect(openClawModelRef({ model: 'openai/gpt-5.6-sol' })).toBe('openai/gpt-5.6-sol')
    expect(openClawModelRef({ model: 'gpt-5.6-sol' })).toBeNull()
    expect(openClawModelRef({})).toBeNull()
  })
})

describe('learning from a rejected patch', () => {
  // Verbatim gateway wording, live 2026.7.1-2.
  const REJECTION = new Error(
    'thinkingLevel "adaptive" is not supported for openai/gpt-5.6-sol ' +
      '(use off|minimal|low|medium|high|xhigh|max|ultra)'
  )

  test('parses the model and its real menu out of the message', () => {
    expect(parseOpenClawThinkingRejection(REJECTION)).toEqual({
      modelRef: 'openai/gpt-5.6-sol',
      levels: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']
    })
  })

  test('recording a rejection corrects the stored menu', () => {
    recordOpenClawThinkingProfile({
      modelProvider: 'openai',
      model: 'gpt-5.6-sol',
      thinkingOptions: ['off', 'adaptive', 'high'],
      thinkingDefault: 'high'
    })
    expect(recordOpenClawThinkingRejection(REJECTION)).toBe(true)
    const profile = openClawThinkingProfile('openai/gpt-5.6-sol')
    expect(profile?.levels).not.toContain('adaptive')
    // `high` survived the correction, so the default is kept.
    expect(profile?.default).toBe('high')
  })

  test('a default that the corrected menu drops is discarded', () => {
    recordOpenClawThinkingProfile({
      modelProvider: 'ollama',
      model: 'deepseek-v4-flash:cloud',
      thinkingOptions: ['off', 'minimal'],
      thinkingDefault: 'minimal'
    })
    recordOpenClawThinkingRejection(
      new Error(
        'thinkingLevel "minimal" is not supported for ollama/deepseek-v4-flash:cloud ' +
          '(use off|low|medium|high|max)'
      )
    )
    expect(openClawThinkingProfile('ollama/deepseek-v4-flash:cloud')?.default).toBeUndefined()
  })

  test('the generic pre-resolution validator is not treated as a model menu', () => {
    // This one fires before the model is resolved, so its list is not
    // authoritative for any particular model.
    expect(
      parseOpenClawThinkingRejection(
        new Error('invalid thinkingLevel (use off|minimal|low|medium|high|xhigh|max|ultra)')
      )
    ).toBeNull()
    expect(recordOpenClawThinkingRejection(new Error('model not allowed: x/y'))).toBe(false)
    expect(parseOpenClawThinkingRejection(undefined)).toBeNull()
  })
})
