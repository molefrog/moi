import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { describe, expect, test } from 'bun:test'

import { HiddenPanel } from './HiddenPanel'

describe('HiddenPanel', () => {
  test('keeps the add action available without hidden widgets', () => {
    const html = renderToStaticMarkup(
      createElement(HiddenPanel, {
        items: [],
        renderItem: () => null,
        onCreateWidget: () => {},
        onClose: () => {},
        onRestore: () => {}
      })
    )

    expect(html).toContain('Hidden widgets')
    expect(html).toContain('New widget')
  })
})
