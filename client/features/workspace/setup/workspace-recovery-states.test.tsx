import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HarnessUnavailableState } from './workspace-recovery-states'

for (const [type, label] of [
  ['codex', 'ChatGPT'],
  ['claude-code', 'Claude']
] as const) {
  test(`${label} missing installation uses the compact recovery state`, () => {
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
    expect(html).toContain(`${label} is uninstalled from the device`)
    expect(html).toContain('Check again')
    expect(html).toContain('<img')
    expect(html).not.toContain('Install instructions')
    expect(html).not.toContain('Your agent is unavailable')
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
