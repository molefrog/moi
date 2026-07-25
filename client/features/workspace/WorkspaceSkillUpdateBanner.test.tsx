import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { describe, expect, test } from 'bun:test'

import { WorkspaceSkillUpdateBanner } from './WorkspaceSkillUpdateBanner'
import {
  shouldAutomaticallyUpdateWorkspaceSkills,
  shouldShowWorkspaceSkillUpdateBanner
} from './useWorkspaceSkillUpdates'

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

    expect(html).toContain('tabler-icon-folder-exclamation')
    expect(html).toContain('This workspace is using old moi skills')
    expect(html).toContain('Auto-update')
    expect(html).toContain('Update once')
    expect(html).toContain('aria-label="Dismiss skill update"')
    expect(html).toContain('@xl:flex')
    expect(html.indexOf('Auto-update')).toBeLessThan(html.indexOf('Update once'))
  })

  test('renders a status-only banner during automatic updates', () => {
    const html = renderBanner({ pendingAction: 'auto' })

    expect(html).toContain('role="status"')
    expect(html).toContain('tabler-icon-loader-2')
    expect(html).toContain('Updating moi skills…')
    expect(html).not.toContain('This workspace is using old moi skills')
    expect(html).not.toContain('Auto-update')
    expect(html).not.toContain('Update once')
    expect(html).not.toContain('aria-label="Dismiss skill update"')
  })

  test('keeps the existing pending state for one-time updates', () => {
    const html = renderBanner({ pendingAction: 'once' })

    expect(html).toContain('This workspace is using old moi skills')
    expect(html).toContain('Updating…')
    expect((html.match(/(?<!-)disabled=""/g) ?? []).length).toBe(2)
    expect(html).toContain('aria-label="Dismiss skill update"')
  })

  test('renders update failures with the existing actions and dismiss control', () => {
    const html = renderBanner({ error: 'Network unavailable.' })

    expect(html).toContain('role="alert"')
    expect(html).toContain('Update failed: Network unavailable.')
    expect(html).toContain('Auto-update')
    expect(html).toContain('Update once')
    expect(html).toContain('aria-label="Dismiss skill update"')
  })
})

describe('workspace skill banner visibility', () => {
  test('shows an available update once per manual visit', () => {
    expect(
      shouldShowWorkspaceSkillUpdateBanner({
        updateAvailable: true,
        autoUpdateEnabled: false,
        phase: 'idle'
      })
    ).toBe(true)
    expect(
      shouldShowWorkspaceSkillUpdateBanner({
        updateAvailable: true,
        autoUpdateEnabled: false,
        phase: 'dismissed'
      })
    ).toBe(false)
  })

  test('keeps an engaged automatic update visible', () => {
    expect(
      shouldShowWorkspaceSkillUpdateBanner({
        updateAvailable: true,
        autoUpdateEnabled: true,
        phase: 'active'
      })
    ).toBe(true)
  })

  test('does not open a fresh prompt when automatic updates are enabled', () => {
    expect(
      shouldShowWorkspaceSkillUpdateBanner({
        updateAvailable: true,
        autoUpdateEnabled: true,
        phase: 'idle'
      })
    ).toBe(false)
  })
})

describe('automatic workspace skill updates', () => {
  test('starts an available update while the visit is idle', () => {
    expect(
      shouldAutomaticallyUpdateWorkspaceSkills({
        updateAvailable: true,
        autoUpdateEnabled: true,
        updatePending: false,
        phase: 'idle'
      })
    ).toBe(true)
  })

  test('does not retry an active or pending update', () => {
    expect(
      shouldAutomaticallyUpdateWorkspaceSkills({
        updateAvailable: true,
        autoUpdateEnabled: true,
        updatePending: false,
        phase: 'active'
      })
    ).toBe(false)
    expect(
      shouldAutomaticallyUpdateWorkspaceSkills({
        updateAvailable: true,
        autoUpdateEnabled: true,
        updatePending: true,
        phase: 'idle'
      })
    ).toBe(false)
  })
})
