import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HarnessUnavailableState } from './workspace-recovery-states'

for (const [type, label] of [
  ['codex', 'ChatGPT'],
  ['claude-code', 'Claude']
] as const) {
  test(`${label} manual installation fallback retains the installation instructions`, () => {
    const html = renderToStaticMarkup(
      <HarnessUnavailableState
        type={type}
        availability={{
          status: 'unavailable',
          code: 'not-installed',
          reason: 'Install instructions'
        }}
        retrying={false}
        onRetry={() => {}}
      />
    )
    expect(html).toContain('Try again')
    expect(html).toContain('Install instructions')
    expect(html).toContain('Your agent is unavailable')
  })
}

test('other unavailable errors retain their reason instead of claiming the agent is uninstalled', () => {
  const html = renderToStaticMarkup(
    <HarnessUnavailableState
      type="codex"
      availability={{ status: 'unavailable', reason: 'Network failed' }}
      retrying
      onRetry={() => {}}
    />
  )
  expect(html).toContain('Network failed')
  expect(html).not.toContain('uninstalled from the device')
  expect(html).toContain('disabled')
})
