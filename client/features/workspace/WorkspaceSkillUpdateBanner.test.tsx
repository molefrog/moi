import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { describe, expect, test } from 'bun:test'

import { WorkspaceSkillUpdateBanner } from './WorkspaceSkillUpdateBanner'
import { shouldShowWorkspaceSkillUpdateBanner } from './useWorkspaceSkillUpdateBanner'

function renderBanner(
  props: Partial<Parameters<typeof WorkspaceSkillUpdateBanner>[0]> = {}
): string {
  return renderToStaticMarkup(
    createElement(WorkspaceSkillUpdateBanner, {
      error: null,
      pendingAction: null,
      onUpdate: () => undefined,
      onDismiss: () => undefined,
      ...props
    })
  )
}

describe('WorkspaceSkillUpdateBanner', () => {
  test('renders the primary, secondary, and dismiss actions', () => {
    const html = renderBanner()

    expect(html).toContain('tabler-icon-alert-square-rounded')
    expect(html).toContain('This workspace is using old moi skills')
    expect(html).toContain('Auto-update')
    expect(html).toContain('Update once')
    expect(html).toContain('aria-label="Dismiss skill update"')
    expect(html).toContain('@xl:flex')
    expect(html.indexOf('Auto-update')).toBeLessThan(html.indexOf('Update once'))
  })

  test('renders the selected pending action and disables both updates', () => {
    const html = renderBanner({ pendingAction: 'never' })

    expect(html).toContain('Updating…')
    expect((html.match(/(?<!-)disabled=""/g) ?? []).length).toBe(2)
  })

  test('renders update failures as an alert', () => {
    const html = renderBanner({ error: 'Network unavailable.' })

    expect(html).toContain('role="alert"')
    expect(html).toContain('Update failed: Network unavailable.')
  })
})

describe('workspace skill banner visibility', () => {
  test('shows an available update once per unsuppressed visit', () => {
    expect(
      shouldShowWorkspaceSkillUpdateBanner({
        updateAvailable: true,
        permanentlyDisabled: false,
        phase: 'idle'
      })
    ).toBe(true)
    expect(
      shouldShowWorkspaceSkillUpdateBanner({
        updateAvailable: true,
        permanentlyDisabled: false,
        phase: 'dismissed'
      })
    ).toBe(false)
  })

  test('keeps an engaged banner visible after the permanent opt-out is saved', () => {
    expect(
      shouldShowWorkspaceSkillUpdateBanner({
        updateAvailable: true,
        permanentlyDisabled: true,
        phase: 'active'
      })
    ).toBe(true)
  })

  test('does not open a fresh banner for a permanently disabled workspace', () => {
    expect(
      shouldShowWorkspaceSkillUpdateBanner({
        updateAvailable: true,
        permanentlyDisabled: true,
        phase: 'idle'
      })
    ).toBe(false)
  })
})
