import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { describe, expect, test } from 'bun:test'

import { WorkspaceSplitLayout } from './WorkspaceSplitLayout'

describe('WorkspaceSplitLayout', () => {
  test('renders workspace and chat around an accessible resize handle', () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceSplitLayout, {
        workspace: createElement('div', null, 'Workspace content'),
        chat: createElement('div', null, 'Chat content'),
        workspaceMinWidth: 640,
        chatMinWidth: 320,
        chatMaxWidth: 460,
        chatWidth: 360,
        onChatWidthChange: () => undefined
      })
    )

    expect(html).toContain('data-slot="resizable-panel-group"')
    expect(html).toContain('overflow-visible!')
    expect(html).toContain('data-slot="workspace-split-workspace"')
    expect(html).toContain('data-slot="workspace-split-chat"')
    expect(html).toContain('flex h-full min-h-0 min-w-0 flex-col')
    expect(html).toContain('aria-label="Resize chat"')
    expect(html).toContain('role="separator"')
    expect(html.indexOf('Workspace content')).toBeLessThan(html.indexOf('role="separator"'))
    expect(html.indexOf('role="separator"')).toBeLessThan(html.indexOf('Chat content'))
  })
})
