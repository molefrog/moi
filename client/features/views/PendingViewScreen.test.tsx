import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import type { PendingView } from '@/lib/types'

import { PendingViewScreen } from './PendingViewScreen'

const pendingView: PendingView = {
  id: 'draft-1',
  status: 'draft',
  requirements: '',
  executionSessionId: 'session-1'
}

function renderPendingView(
  displayStatus: PendingView['status'] | 'waiting' | 'building',
  active = true
): string {
  return renderToStaticMarkup(
    createElement(PendingViewScreen, {
      active,
      running: displayStatus === 'building',
      pendingView: {
        ...pendingView,
        status:
          displayStatus === 'waiting' || displayStatus === 'building' ? 'submitted' : displayStatus
      },
      chatDocked: false,
      workspaceId: 'workspace-1',
      onEditingStart: () => undefined,
      onContinueInChat: () => undefined,
      onOpenChat: () => undefined,
      onDiscard: () => undefined
    })
  )
}

describe('PendingViewScreen', () => {
  test('keeps an inactive draft mounted', () => {
    const active = renderPendingView('draft')
    const inactive = renderPendingView('draft', false)

    expect(active).toContain('Sketch how the view should look')
    expect(active).toContain('Drawing area')
    expect(inactive).toContain('Sketch how the view should look')
    expect(inactive).toContain('Drawing area')
  })

  test('keeps the sketch surface mounted through startup and building', () => {
    const starting = renderPendingView('starting')
    const waiting = renderPendingView('waiting')
    const building = renderPendingView('building')
    const failed = renderPendingView('failed')

    expect(starting).toContain('Starting view chat…')
    expect(starting).toContain('Drawing area')
    expect(waiting).toContain('The view needs your attention')
    expect(waiting).toContain('Drawing area')
    expect(building).toContain('Drawing area')
    expect(building).toContain('data-slot="spinner"')
    expect(failed).toContain('Drawing area')
    expect(failed).toContain('Discard view')
    expect(waiting).not.toContain('invisible')
    expect(starting).not.toContain('Sketch how the view should look')
    expect(renderPendingView('starting', false)).toContain('Drawing area')
    expect(renderPendingView('waiting', false)).toContain('The view needs your attention')
    expect(renderPendingView('building', false)).toContain('Drawing area')
  })
})
