import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { IconLayout2, IconMessages } from '@tabler/icons-react'
import { describe, expect, test } from 'bun:test'

import { WorkspaceTabs } from '@/client/features/workspace/WorkspaceTabs'

describe('WorkspaceTabs', () => {
  test('renders Overview without drag attributes and keeps other tabs reorderable', () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceTabs, {
        tabs: [
          {
            key: 'views/test',
            Icon: IconMessages,
            label: 'Test view'
          },
          {
            key: 'overview',
            Icon: IconLayout2,
            label: 'Overview',
            reorderable: false,
            loading: true
          },
          {
            key: 'scratchpad',
            Icon: IconLayout2,
            label: 'Scratchpad'
          }
        ],
        active: 'views/test',
        createItems: [],
        onSelect: () => undefined,
        onClose: () => undefined,
        onReorder: () => undefined
      })
    )

    expect(html).toContain('tabler-icon-messages')
    expect(html).not.toContain('mo-root')
    expect(html).toContain('data-slot="spinner"')
    const overviewButton = html.match(/<button[^>]*aria-label="Overview"[^>]*>/)?.[0]
    const viewButton = html.match(/<button[^>]*aria-label="Test view"[^>]*>/)?.[0]
    expect(overviewButton).not.toContain('aria-roledescription')
    expect(viewButton).toContain('aria-roledescription="sortable item"')
  })
})
