import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { Router } from 'wouter'
import { Workspace } from '@/client/features/workspace/WorkspaceContext'
import { MarkdownContent } from './MarkdownContent'

test('chat renders portable links as native workspace hrefs with the deployment base', () => {
  const html = renderToStaticMarkup(
    <Router base="/prefix">
      <Workspace id="abc">
        <MarkdownContent content="[Event](moi:/views/events?eventId=123) [Web](https://example.com/)" />
      </Workspace>
    </Router>
  )
  expect(html).toContain('href="/prefix/workspace/abc/views/events?eventId=123"')
  expect(html).toContain('href="https://example.com/"')
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
