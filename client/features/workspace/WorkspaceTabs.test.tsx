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
            key: 'agent',
            Icon: IconMessages,
            label: 'Agent'
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
        active: 'agent',
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
    const agentButton = html.match(/<button[^>]*aria-label="Agent"[^>]*>/)?.[0]
    expect(overviewButton).not.toContain('aria-roledescription')
    expect(agentButton).toContain('aria-roledescription="sortable item"')
  })
})
