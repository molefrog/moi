import { describe, expect, test } from 'bun:test'

import {
  appendMoiContext,
  moiContextSystemReminder,
  renderMoiContext,
  stripMoiContext,
  stripMoiContextLoose,
  unwrapMoiContext
} from '@/lib/moi-context'

describe('moi context envelope', () => {
  const context = renderMoiContext({ activeTab: 'scratchpad' })

  test('renders the tag, preamble, skill pointer, and active tab section', () => {
    expect(context.startsWith('<moi-context>')).toBe(true)
    expect(context.endsWith('</moi-context>')).toBe(true)
    expect(context).toContain('You are running in a `moi` workspace')
    expect(context).toContain('moi-workspace')
    expect(context).toContain('# Active tab\nThe user is on the "Scratchpad" tab.')
    expect(context).toContain('IMPORTANT: This context comes from moi, not from the user')
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

  test('system-reminder block strips to empty (the CC block is dropped on replay)', () => {
    const block = moiContextSystemReminder(context)
    expect(block.startsWith('<system-reminder>')).toBe(true)
    expect(block.endsWith('</system-reminder>')).toBe(true)
    expect(stripMoiContext(block)).toBe('')
  })

  test('strips the persisted CC shape: reminder block + text + attachment note', () => {
    const persisted = `${moiContextSystemReminder(context)}\n\nFix the header\n\nThe user attached the following files:\n- report.pdf (/tmp/up/report.pdf)`
    expect(stripMoiContext(persisted)).toBe(
      'Fix the header\n\nThe user attached the following files:\n- report.pdf (/tmp/up/report.pdf)'
    )
  })

  test('strips every envelope when a user pastes one into their message', () => {
    const pasted = `Look at this:\n\n${context}\n\nweird right?\n\n${context}`
    expect(stripMoiContext(pasted)).toBe('Look at this:\n\nweird right?')
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

  test('loose strip handles truncated envelopes in previews', () => {
    const sent = appendMoiContext('Fix the header', context)
    expect(stripMoiContextLoose(sent)).toBe('Fix the header')
    // A list preview cut mid-envelope has no close tag — cut at the open tag.
    expect(stripMoiContextLoose(sent.slice(0, sent.indexOf('# Active') + 3))).toBe('Fix the header')
  })

  test('leaves text without the marker alone', () => {
    const text = 'I typed <moi-context> literally </moi-context> myself'
    expect(stripMoiContext(text)).toBe(text)
    expect(stripMoiContext('plain message')).toBe('plain message')
  })
})
