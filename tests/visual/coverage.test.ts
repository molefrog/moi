import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import registry from '@/registry.json' with { type: 'json' }

const root = join(import.meta.dir, '../..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

// ui-components.visual.ts captures every entry in UI_COMPONENT_PREVIEWS, so a
// component without one would go uncaptured.
test('every registry component has a preview to capture', () => {
  const previews = read('client/features/dev/ui-components/ui-component-previews.tsx')
  const listed = previews.slice(previews.indexOf('export const UI_COMPONENT_PREVIEWS'))
  const missing = registry.items
    .filter(item => item.type === 'registry:ui')
    .map(item => item.name)
    .filter(name => !new RegExp(`^\\s*'?${name}'?:`, 'm').test(listed))
  expect(missing).toEqual([])
})

// /dev routes whose content another capture already covers.
const COVERED_ELSEWHERE: Record<string, string> = {
  '/dev': 'the index of the other playground pages',
  '/dev/collab-kit': 'redirects to /dev/collab',
  '/dev/ui-components': 'each preview is captured alone by ui-components.visual.ts',
  '/dev/workspace-setup': 'app.visual.ts captures the welcome and agent recovery screens',
  '/dev/harness': 'a debugging tool that drives a live agent CLI'
}

test('every /dev playground page is captured', () => {
  const routes = [
    ...read('client/features/dev/dev-routes.tsx').matchAll(/path="(\/dev[^"]*)"/g)
  ].map(match => match[1] ?? '')
  const visited = read('tests/visual/dev-pages.visual.ts')
  const uncaptured = routes.filter(
    route => !(route in COVERED_ELSEWHERE) && !visited.includes(`'${route}'`)
  )
  expect(routes.length).toBeGreaterThan(0)
  expect(uncaptured).toEqual([])
})
