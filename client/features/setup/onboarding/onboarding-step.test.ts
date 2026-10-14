import { expect, test } from 'bun:test'
import type { HarnessInstallations } from '@/lib/types'
import { getOnboardingStep } from './onboarding-step'

const missing: HarnessInstallations = {
  'claude-code': false,
  codex: false,
  openclaw: false,
  hermes: false
}

test('installation takes precedence even when workspaces already exist', () => {
  for (const environment of ['local', 'cloud'] as const) {
    expect(getOnboardingStep(environment, missing, 0, true)).toBe('agent')
    expect(getOnboardingStep(environment, missing, 3, true)).toBe('agent')
  }
})

test('all installation combinations route by environment and registered workspaces', () => {
  for (let bits = 0; bits < 16; bits++) {
    const installed = {
      'claude-code': Boolean(bits & 1),
      codex: Boolean(bits & 2),
      openclaw: Boolean(bits & 4),
      hermes: Boolean(bits & 8)
    }
    for (const environment of ['local', 'cloud'] as const) {
      const hasAgent = environment === 'local' ? bits !== 0 : (bits & 3) !== 0
      expect(getOnboardingStep(environment, installed, 0, true)).toBe(
        hasAgent ? 'workspace' : 'agent'
      )
      expect(getOnboardingStep(environment, installed, 2, true)).toBe(
        hasAgent ? undefined : 'agent'
      )
    }
  }
})

test('installing, creating, and uninstalling drive the flow without a completion flag', () => {
  const installed = { ...missing, codex: true }
  expect(getOnboardingStep('local', missing, 0, true)).toBe('agent')
  expect(getOnboardingStep('local', installed, 0, true)).toBe('workspace')
  expect(getOnboardingStep('local', installed, 1, true)).toBeUndefined()
  expect(getOnboardingStep('local', missing, 1, true)).toBe('agent')
  expect(getOnboardingStep('local', installed, 1, true)).toBeUndefined()
})

test('login is required only before the first workspace', () => {
  for (const environment of ['local', 'cloud'] as const) {
    const installed = { ...missing, codex: true }
    expect(getOnboardingStep(environment, installed, 0, false)).toBe('agent')
    expect(getOnboardingStep(environment, installed, 0, true)).toBe('workspace')
    expect(getOnboardingStep(environment, installed, 1, false)).toBeUndefined()
  }
})
