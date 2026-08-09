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
        open: true,
        workspaceMinWidth: 640,
        chatMinWidth: 320,
        chatMaxWidth: 460,
        chatWidth: 360,
        onCollapse: () => undefined,
        onChatWidthChange: () => undefined
      })
    )

    expect(html).toContain('data-slot="resizable-panel-group"')
    expect(html).toContain('overflow-visible!')
    expect(html).toContain('data-slot="workspace-split-workspace"')
    expect(html).toContain('data-slot="workspace-split-chat"')
    expect(html).toContain('min-w-(--chat-min)')
    expect(html).toContain('id="chat"')
    expect(html).toContain('flex-basis:360px')
    expect(html).toContain('aria-label="Resize chat"')
    expect(html).toContain('role="separator"')
    expect(html).not.toContain('aria-hidden="true"')
    expect(html).not.toContain('aria-disabled="true"')
    expect(html).not.toContain('transition-[flex-grow]')
    expect(html).not.toContain('transition-opacity')
    expect(html.indexOf('Workspace content')).toBeLessThan(html.indexOf('role="separator"'))
    expect(html.indexOf('role="separator"')).toBeLessThan(html.indexOf('Chat content'))
  })

  test('collapses and hides the chat while keeping the split layout mounted', () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceSplitLayout, {
        workspace: createElement('div', null, 'Workspace content'),
        chat: createElement('div', null, 'Chat content'),
        open: false,
        workspaceMinWidth: 640,
        chatMinWidth: 320,
        chatMaxWidth: 460,
        chatWidth: 360,
        onCollapse: () => undefined,
        onChatWidthChange: () => undefined
      })
    )

    expect(html).toContain('data-slot="resizable-panel-group"')
    expect(html).toContain('id="chat"')
    expect(html).toContain('flex-basis:0')
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('inert=""')
    expect(html).toContain('aria-label="Resize chat"')
    expect(html).toContain('role="separator"')
    expect(html).toContain('hidden=""')
    expect(html).toContain('aria-disabled="true"')
    expect(html).toContain('data-separator="disabled"')
    expect(html.indexOf('Workspace content')).toBeLessThan(html.indexOf('Chat content'))
  })
})
