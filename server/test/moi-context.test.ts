import { describe, expect, test } from 'bun:test'

import {
  appendMoiContext,
  renderMoiContext,
  stripMoiContext,
  unwrapMoiContext,
  wrapMoiContextSystemReminder
} from '@/lib/moi-context'

describe('moi context envelope', () => {
  const context = renderMoiContext({ activeTab: 'scratchpad' })

  test('renders the tag, preamble, skill pointer, and active tab section', () => {
    expect(context.startsWith('<moi-context>')).toBe(true)
    expect(context.endsWith('</moi-context>')).toBe(true)
    expect(context).toContain('You are running in a `moi` workspace')
    expect(context).toContain('moi-workspace')
    expect(context).toContain('# Active tab\nThe user is on the "Scratchpad" tab.')
    expect(context).toContain('IMPORTANT: This context comes from the moi app')
  })

  test('describes tabs with their UI labels', () => {
    expect(renderMoiContext({ activeTab: 'view:crm' })).toContain(
      'The user is on the "crm" view tab (.moi/views/crm.tsx).'
    )
    expect(renderMoiContext({ activeTab: 'agent' })).toContain('The user is on the "Agent" tab.')
  })

  test('a view tab with a configured title names both title and file', () => {
    expect(
      renderMoiContext({ activeTab: 'view:color-studio', tabTitle: 'Grading review' })
    ).toContain('The user is on the "Grading review" view tab (.moi/views/color-studio.tsx).')
  })

  test('append + strip round-trips the user text', () => {
    const sent = appendMoiContext('Fix the header', context)
    expect(sent).toContain('<moi-context>')
    expect(stripMoiContext(sent)).toBe('Fix the header')
  })

  test('system-reminder wrap + strip round-trips the user text', () => {
    const sent = wrapMoiContextSystemReminder('Fix the header', context)
    expect(sent.startsWith('<system-reminder>')).toBe(true)
    expect(stripMoiContext(sent)).toBe('Fix the header')
  })

  test('context-only message strips to empty', () => {
    expect(stripMoiContext(wrapMoiContextSystemReminder('', context))).toBe('')
  })

  test('renders directives under a this-message-only section', () => {
    const rendered = renderMoiContext({
      activeTab: 'view-builder:builder-1',
      directives: ['Do the thing first.', 'Then bundle.']
    })
    expect(rendered).toContain('The user is on the view builder tab for builder "builder-1".')
    expect(rendered).toContain('# This message only\nDo the thing first.\nThen bundle.')
    expect(stripMoiContext(appendMoiContext('Build it', rendered))).toBe('Build it')
  })

  test('unwrap removes the wrapper tag and keeps the body', () => {
    const body = unwrapMoiContext(context)
    expect(body.startsWith('<moi-context>')).toBe(false)
    expect(body.endsWith('</moi-context>')).toBe(false)
    expect(body).toContain('You are running in a `moi` workspace')
    expect(body).toContain('The user is on the "Scratchpad" tab.')
    // Already-unwrapped text passes through.
    expect(unwrapMoiContext(body)).toBe(body)
  })

  test('leaves text without the marker alone', () => {
    const text = 'I typed <moi-context> literally </moi-context> myself'
    expect(stripMoiContext(text)).toBe(text)
    expect(stripMoiContext('plain message')).toBe('plain message')
  })
})
