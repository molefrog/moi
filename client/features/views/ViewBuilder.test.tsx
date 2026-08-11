import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import type { ViewBuilder as ViewBuilderData } from '@/lib/types'

import { ViewBuilder } from './ViewBuilder'

const builder: ViewBuilderData = {
  id: 'builder-1',
  status: 'draft',
  input: { requirements: '' },
  sessionId: 'session-1',
  createdAt: 1,
  updatedAt: 1
}

function renderBuilder(status: ViewBuilderData['status'], active = true): string {
  return renderToStaticMarkup(
    createElement(ViewBuilder, {
      active,
      builder: { ...builder, status },
      chatDocked: false,
      workspaceId: 'workspace-1',
      onEditingStart: () => undefined,
      onContinueInChat: () => undefined,
      onOpenChat: () => undefined,
      onDiscard: () => undefined
    })
  )
}

describe('ViewBuilder', () => {
  test('keeps an inactive draft mounted and hidden', () => {
    const active = renderBuilder('draft')
    const inactive = renderBuilder('draft', false)

    expect(active).toContain('Sketch how the view should look')
    expect(active).toContain('Drawing area')
    expect(active).toContain('flex')
    expect(inactive).toContain('Sketch how the view should look')
    expect(inactive).toContain('hidden')
  })

  test('keeps the sketch canvas mounted behind post-submit states', () => {
    const waiting = renderBuilder('waiting')
    const building = renderBuilder('building')

    expect(waiting).toContain('The view needs your attention')
    expect(waiting).toContain('invisible')
    expect(building).toContain('Building view…')
    expect(building).toContain('Drawing area')
    expect(building).toContain('opacity-25')
    expect(renderBuilder('waiting', false)).toContain('hidden')
    expect(renderBuilder('building', false)).toContain('hidden')
  })

  test('leaves ready builders to the tab replacement flow', () => {
    expect(renderBuilder('ready')).toBe('')
  })
})
