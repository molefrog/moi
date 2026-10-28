import { expect, test } from 'bun:test'

import { resolveChatRunOptions } from '@/client/features/chat/chat-send'
import { resolveFastMode } from '@/client/features/chat/composer/model-order'
import type { FastMode } from '@/lib/types'
import { type CodexModel, codexModelsToModels, codexServiceTierForFastMode } from './adapter'

const base: CodexModel = { id: 'model', model: 'model', displayName: 'Model' }
const fast = { id: 'priority', name: 'Fast', description: '' }
const ultrafast = { id: 'ultrafast', name: 'Ultrafast', description: '' }

const catalogs: { name: string; model: CodexModel; expected: FastMode }[] = [
  { name: 'before speed metadata', model: base, expected: false },
  { name: 'legacy fast only', model: { ...base, additionalSpeedTiers: ['fast'] }, expected: true },
  {
    name: 'legacy ultrafast',
    model: { ...base, additionalSpeedTiers: ['fast', 'ultrafast'] },
    expected: 'ultrafast'
  },
  { name: 'current fast only', model: { ...base, serviceTiers: [fast] }, expected: true },
  {
    name: 'current ultrafast',
    model: { ...base, serviceTiers: [fast, ultrafast] },
    expected: 'ultrafast'
  },
  {
    name: 'current empty overrides legacy',
    model: { ...base, serviceTiers: [], additionalSpeedTiers: ['fast', 'ultrafast'] },
    expected: false
  },
  {
    name: 'unknown future tier',
    model: { ...base, serviceTiers: [{ id: 'future', name: 'Future', description: '' }] },
    expected: false
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
  expect(resolveFastMode(models[1], 'ultrafast')).toBe(expected)
  expect(run.fastMode).toBe(expected)
  expect(codexServiceTierForFastMode(run.fastMode)).toBe(
    expected === 'ultrafast' ? 'ultrafast' : expected ? 'priority' : null
  )
})

test.each(['fast', 'priority'])(
  'preserves the configured %s alias with legacy and current catalogs',
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
      expect(resolveFastMode(models[1], undefined)).toBe(true)
      expect(resolveChatRunOptions(agent, 'model', undefined).fastMode).toBe(true)
      expect(resolveChatRunOptions(agent, 'model', undefined, false).fastMode).toBe(false)
    }
  }
)
