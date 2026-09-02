import { expect, test } from 'bun:test'

import pkg from '../../package.json'

// tldraw must be pinned EXACTLY — no ^/~ range. The client is prebuilt into
// dist/ at publish time with the publisher's node_modules, but the server's
// tldraw resolves from the range at *install* time. With a range, one published
// version can ship a dist client OLDER than the server that serves it, and the
// server then writes .moi/.scratchpad.json snapshots its own client cannot read
// (tldraw has no down-migrations). An exact pin makes the two always agree.
// Bumping tldraw is a deliberate act: change the pin, bun install, test,
// release-note it. See docs/moi-scratchpad.md § Version skew.
test('tldraw is pinned to an exact version', () => {
  expect(pkg.dependencies.tldraw).toMatch(/^\d/)
})

// The server writes scratchpad snapshots through tldraw's React-free
// sub-packages (see server/scratchpad-executor.ts), imported directly rather
// than via `tldraw`. They must be pinned to the very same version as `tldraw`:
// they're the schema the server writes, and `tldraw` is the schema the browser
// reads. Bump all four together.
const SERVER_SUBPACKAGES = ['@tldraw/store', '@tldraw/tlschema', '@tldraw/utils'] as const

test('the server-side tldraw sub-packages are pinned to the same exact version', () => {
  for (const name of SERVER_SUBPACKAGES) {
    expect(pkg.dependencies[name]).toBe(pkg.dependencies.tldraw)
  }
})
