import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { parseHTML } from 'linkedom'

import { Dialog } from '@/client/components/ui/dialog'
import type { HarnessInstallations } from '@/lib/types'
import { WorkspaceAgentStep } from './WorkspaceAgentStep'
import { getCreateWorkspaceAgentOptions } from './workspace-agent-options'

const missing: HarnessInstallations = {
  'claude-code': false,
  codex: false,
  openclaw: false,
  hermes: false
}

function renderStep(installed?: HarnessInstallations, isChecking = false, errorMessage?: string) {
  const html = renderToStaticMarkup(
    createElement(
      Dialog,
      { open: true },
      createElement(WorkspaceAgentStep, {
        title: 'Create new workspace',
        options: getCreateWorkspaceAgentOptions(installed),
        isLoading: isChecking && !installed,
        errorMessage,
        emptyMessage: 'Install Claude Code or Codex to create a new workspace.',
        selectedType: 'claude-code',
        isPending: isChecking || Boolean(errorMessage),
        secondaryAction: null,
        primaryLabel: 'Next',
        onTypeChange: () => {},
        onSubmit: () => {}
      })
    )
  )
  return parseHTML(`<html><body>${html}</body></html>`).document
}

describe('create agent step states', () => {
  test('keeps missing primary cards focusable and blocks progression', () => {
    const document = renderStep(missing)
    const cards = [...document.querySelectorAll('[aria-label="Agent"] button')]
    expect(cards.length).toBe(2)
    expect(cards.every(card => card.getAttribute('aria-disabled') === 'true')).toBe(true)
    expect(cards.every(card => !card.hasAttribute('disabled'))).toBe(true)
    expect(
      [...document.querySelectorAll('button')]
        .find(button => button.textContent === 'Next')
        ?.hasAttribute('disabled')
    ).toBe(true)
    expect(document.body.textContent).toContain('Install Claude Code or Codex')
  })

  test('uses placeholders before detection and blocks progression', () => {
    const document = renderStep(undefined, true)
    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBe(2)
    expect(document.querySelectorAll('[aria-label="Agent"] button').length).toBe(0)
    expect(
      [...document.querySelectorAll('button')]
        .find(button => button.textContent === 'Next')
        ?.hasAttribute('disabled')
    ).toBe(true)
  })

  test('shows failed detection without enabling Next', () => {
    const document = renderStep(undefined, false, 'Could not check installed agents.')
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(
      'Could not check installed agents.'
    )
    const buttons = [...document.querySelectorAll('button')]
    expect(buttons.find(button => button.textContent === 'Next')?.hasAttribute('disabled')).toBe(
      true
    )
  })
})
