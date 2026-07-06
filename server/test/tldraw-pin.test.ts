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
