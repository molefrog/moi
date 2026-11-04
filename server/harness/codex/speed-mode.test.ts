import { expect, test } from 'bun:test'

import { resolveChatRunOptions } from '@/client/features/chat/chat-send'
import { resolveSpeedMode } from '@/client/features/chat/composer/model-order'
import type { SpeedMode } from '@/lib/types'
import { type CodexModel, codexModelsToModels, codexServiceTierForSpeedMode } from './adapter'

const base: CodexModel = { id: 'model', model: 'model', displayName: 'Model' }
const fast = { id: 'priority', name: 'Fast', description: '' }
const ultrafast = { id: 'ultrafast', name: 'Ultrafast', description: '' }

const catalogs: { name: string; model: CodexModel; expected: SpeedMode }[] = [
  { name: 'before speed metadata', model: base, expected: 'normal' },
  {
    name: 'legacy fast only',
    model: { ...base, additionalSpeedTiers: ['fast'] },
    expected: 'fast'
  },
  {
    name: 'legacy ultrafast',
    model: { ...base, additionalSpeedTiers: ['fast', 'ultrafast'] },
    expected: 'ultrafast'
  },
  { name: 'current fast only', model: { ...base, serviceTiers: [fast] }, expected: 'fast' },
  {
    name: 'current ultrafast',
    model: { ...base, serviceTiers: [fast, ultrafast] },
    expected: 'ultrafast'
  },
  {
    name: 'current empty overrides legacy',
    model: { ...base, serviceTiers: [], additionalSpeedTiers: ['fast', 'ultrafast'] },
    expected: 'normal'
  },
  {
    name: 'unknown future tier',
    model: { ...base, serviceTiers: [{ id: 'future', name: 'Future', description: '' }] },
    expected: 'normal'
  }
]

test.each(catalogs)('$name safely resolves a saved Ultrafast preference', ({ model, expected }) => {
  const models = codexModelsToModels([model], {})
  const run = resolveChatRunOptions(
    { provider: 'codex', availability: { status: 'available' }, models },
    'model',
    undefined,
    'ultrafast'
  )
  expect(resolveSpeedMode(models[1], 'ultrafast')).toBe(expected)
  expect(run.speedMode).toBe(expected)
  expect(codexServiceTierForSpeedMode(run.speedMode)).toBe(
    expected === 'ultrafast' ? 'ultrafast' : expected === 'fast' ? 'priority' : null
  )
})

test.each(['fast', 'priority'])(
  'uses normal without a preference even with configured %s',
  alias => {
    for (const model of [
      { ...base, additionalSpeedTiers: ['fast'] },
      { ...base, serviceTiers: [fast, ultrafast] }
    ]) {
      const models = codexModelsToModels([model], { service_tier: alias })
      const agent = {
        provider: 'codex' as const,
        availability: { status: 'available' as const },
        models
      }
      expect(resolveSpeedMode(models[1], undefined)).toBe('normal')
      expect(resolveChatRunOptions(agent, 'model', undefined).speedMode).toBe('normal')
      expect(resolveChatRunOptions(agent, 'model', undefined, 'normal').speedMode).toBe('normal')
    }
  }
)
