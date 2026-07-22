import { describe, expect, test } from 'bun:test'

import {
  appendMoiContext,
  isMoiContext,
  moiContextSystemReminder,
  renderMoiContext,
  renderMoiContextBody,
  stripMoiContext,
  stripMoiContextLoose
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
    expect(renderMoiContext({ activeTab: 'agent' })).toContain(
      'The user is on the "Agent" tab (full page chat).'
    )
  })

  test('a view tab with a configured title names both title and file', () => {
    expect(
      renderMoiContext({ activeTab: 'view:color-studio', tabTitle: 'Grading review' })
    ).toContain('The user is on the "Grading review" view tab (.moi/views/color-studio.tsx).')
  })

  test('a claimed builder title lands in the view-builder line', () => {
    expect(
      renderMoiContext({ activeTab: 'view-builder:b-42', tabTitle: 'Customer overview' })
    ).toContain('The user is building a new view "Customer overview". Builder id "b-42".')
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

  test('renders active-view params as a sentence + fenced JSON', () => {
    const rendered = renderMoiContext({
      activeTab: 'view:shop',
      tabTitle: 'Shop',
      tabParams: { product: 'scarf' }
    })
    expect(rendered).toContain('The user is on the "Shop" view tab (.moi/views/shop.tsx).')
    expect(rendered).toContain(
      'The view currently shows these param values:\n```json\n{"product":"scarf"}\n```'
    )
    // Empty params render nothing extra.
    expect(renderMoiContext({ activeTab: 'view:shop', tabParams: {} })).not.toContain(
      'param values'
    )
  })

  test('renders an applet action as its own section with fenced context', () => {
    const rendered = renderMoiContext({
      activeTab: 'view:shop',
      intent: { source: 'view:shop', context: { sku: 'milk-1l' } }
    })
    expect(rendered).toContain(
      '# Applet action\nThe user fired this message with an action in "view:shop" — the message text is the action\'s label, not typed by the user.'
    )
    expect(rendered).toContain('The applet attached this context:\n```json\n{"sku":"milk-1l"}\n```')
    // A context-less action still gets the attribution sentence, minus the JSON.
    const bare = renderMoiContext({ activeTab: 'widgets', intent: { source: 'widget:orders' } })
    expect(bare).toContain('an action in "widget:orders"')
    expect(bare).not.toContain('attached this context')
  })

  test('renders directives under a this-message-only section', () => {
    const rendered = renderMoiContext({
      activeTab: 'view-builder:builder-1',
      directives: ['Do the thing first.', 'Then bundle.']
    })
    expect(rendered).toContain('The user is building a new view. Builder id "builder-1".')
    expect(rendered).toContain('# This message only\nDo the thing first.\nThen bundle.')
    expect(stripMoiContext(appendMoiContext('Build it', rendered))).toBe('Build it')
  })

  test('the body render is the envelope minus the wrapper tag', () => {
    const body = renderMoiContextBody({ activeTab: 'scratchpad' })
    expect(body.startsWith('<moi-context>')).toBe(false)
    expect(body).toContain('You are running in a `moi` workspace')
    expect(body).toContain('The user is on the "Scratchpad" tab.')
    expect(renderMoiContext({ activeTab: 'scratchpad' })).toBe(
      `<moi-context>\n${body}\n</moi-context>`
    )
  })

  test('wire guard accepts valid shapes and rejects junk', () => {
    expect(isMoiContext({ activeTab: 'scratchpad' })).toBe(true)
    expect(isMoiContext({ activeTab: 'view:crm', tabTitle: 'CRM', directives: ['Do it.'] })).toBe(
      true
    )
    expect(isMoiContext(undefined)).toBe(false)
    expect(isMoiContext('rendered text')).toBe(false)
    expect(isMoiContext({ tabTitle: 'CRM' })).toBe(false)
    expect(isMoiContext({ activeTab: 'agent', directives: [1] })).toBe(false)
  })

  test('wire guard validates tabParams and intent shapes', () => {
    expect(isMoiContext({ activeTab: 'view:shop', tabParams: { product: 'scarf' } })).toBe(true)
    expect(
      isMoiContext({
        activeTab: 'view:shop',
        intent: { source: 'view:shop', context: { sku: 1 } }
      })
    ).toBe(true)
    expect(isMoiContext({ activeTab: 'view:shop', intent: { source: 'view:shop' } })).toBe(true)
    expect(isMoiContext({ activeTab: 'view:shop', tabParams: ['scarf'] })).toBe(false)
    expect(isMoiContext({ activeTab: 'view:shop', intent: { context: {} } })).toBe(false)
    expect(isMoiContext({ activeTab: 'view:shop', intent: { source: 1 } })).toBe(false)
    expect(isMoiContext({ activeTab: 'view:shop', intent: { source: 'x', context: 'y' } })).toBe(
      false
    )
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
