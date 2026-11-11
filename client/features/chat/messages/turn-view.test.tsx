import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { Workspace } from '@/client/features/workspace/workspace-context'
import { WorkspaceLayoutContext } from '@/client/features/workspace/workspace-layout-context'
import { createDefaultWorkspaceLayout } from '@/lib/workspace-layout'
import { TurnView } from './turn-view'

test('renders Markdown in user message bubbles', () => {
  const html = renderToStaticMarkup(
    <Workspace id="test">
      <WorkspaceLayoutContext.Provider
        value={{
          layout: createDefaultWorkspaceLayout(),
          setLayout: () => {},
          name: null,
          cwd: null,
          provider: 'codex',
          workspaceId: 'test',
          chatAvailable: true,
          isLoading: false
        }}
      >
        <TurnView
          turn={{
            id: 'user-1',
            role: 'user',
            origin: { kind: 'user-input' },
            parts: [
              {
                type: 'text',
                text: '## Plan\n\n- **Build** a view\n\n[Open](moi:/views/demo)\n\n`code`'
              }
            ]
          }}
        />
      </WorkspaceLayoutContext.Provider>
    </Workspace>
  )
  expect(html).toContain('<h2>Plan</h2>')
  expect(html).toContain('<ul>')
  expect(html).toContain('<strong>Build</strong>')
  expect(html).toContain('href="/workspace/test/views/demo"')
  expect(html).toContain('>code</code>')
})
