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

  test('renders the tag, marker, skill pointer, and active tab', () => {
    expect(context.startsWith('<moi-context>')).toBe(true)
    expect(context.endsWith('</moi-context>')).toBe(true)
    expect(context).toContain('moi workspace context')
    expect(context).toContain('moi-workspace skill')
    expect(context).toContain('The user is on: scratchpad')
  })

  test('describes view tabs by their id', () => {
    expect(renderMoiContext({ activeTab: 'view:crm' })).toContain('view "crm"')
    expect(renderMoiContext({ activeTab: 'agent' })).toContain('The user is on: chat')
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

  test('renders directives after the tab line', () => {
    const rendered = renderMoiContext({
      activeTab: 'view-builder:builder-1',
      directives: ['Do the thing first.', 'Then bundle.']
    })
    expect(rendered).toContain('The user is on: view builder "builder-1"')
    expect(rendered).toContain('Do the thing first.')
    expect(rendered).toContain('Then bundle.')
    expect(stripMoiContext(appendMoiContext('Build it', rendered))).toBe('Build it')
  })

  test('unwrap removes the wrapper tag and keeps the body', () => {
    const body = unwrapMoiContext(context)
    expect(body.startsWith('<moi-context>')).toBe(false)
    expect(body.endsWith('</moi-context>')).toBe(false)
    expect(body).toContain('moi workspace context')
    expect(body).toContain('The user is on: scratchpad')
    // Already-unwrapped text passes through.
    expect(unwrapMoiContext(body)).toBe(body)
  })

  test('leaves text without the marker alone', () => {
    const text = 'I typed <moi-context> literally </moi-context> myself'
    expect(stripMoiContext(text)).toBe(text)
    expect(stripMoiContext('plain message')).toBe('plain message')
  })
})
