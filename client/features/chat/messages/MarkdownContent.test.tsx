import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { Router } from 'wouter'
import { Workspace } from '@/client/features/workspace/WorkspaceContext'
import { MarkdownContent } from './MarkdownContent'

test('chat renders portable links as native workspace hrefs with the deployment base', () => {
  const html = renderToStaticMarkup(
    <Router base="/prefix">
      <Workspace id="abc">
        <MarkdownContent content="[Event](moi:/views/events?eventId=123) [Chat](moi:/chats/chat-1) [Web](https://example.com/)" />
      </Workspace>
    </Router>
  )
  expect(html).toContain('href="/prefix/workspace/abc/views/events?eventId=123"')
  expect(html).toContain('href="https://example.com/"')
  expect(html).toContain('href="/prefix/workspace/abc/chats/chat-1"')
})

test('invalid moi links and executable URLs stay sanitized, including images', () => {
  const html = renderToStaticMarkup(
    <Workspace id="abc">
      <MarkdownContent content="[Invalid](moi://views/events) [Script](javascript:alert) ![Image](moi:/views/events)" />
    </Workspace>
  )
  expect(html).not.toContain('href="moi:')
  expect(html).not.toContain('javascript:')
  expect(html).not.toContain('src="moi:')
})

test('chat resolves workspace file links and sanitizes invalid file paths', () => {
  const html = renderToStaticMarkup(
    <Workspace id="abc">
      <MarkdownContent content="[Video](moi:/files/clips/a%20b.mp4#t=5) [Invalid](moi:/files/../photo.png)" />
    </Workspace>
  )
  expect(html).toContain('href="/api/workspaces/abc/files/clips/a%20b.mp4#t=5"')
  expect(html).not.toContain('href="moi:')
  expect(html).not.toContain('/files/../')
})
