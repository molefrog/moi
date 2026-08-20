import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { IconLayout2, IconMessages } from '@tabler/icons-react'
import { describe, expect, test } from 'bun:test'

import { WorkspaceTabs } from '@/client/features/workspace/WorkspaceTabs'

describe('WorkspaceTabs', () => {
  test('renders the messages icon for Agent and a spinner for loading tabs', () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceTabs, {
        tabs: [
          {
            key: 'agent',
            Icon: IconMessages,
            label: 'Agent'
          },
          {
            key: 'widgets',
            Icon: IconLayout2,
            label: 'Widgets',
            loading: true
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
  })
})
