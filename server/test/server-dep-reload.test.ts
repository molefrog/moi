import { afterEach, beforeEach, expect, test } from 'bun:test'
import { parse, stringify } from 'devalue'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'path'

import { callFunction, killAllWorkers } from '../functions'
import { handleBundle } from '../widgets'
import { silenceConsole } from './quiet'

// Editing a helper that ONLY a `.server.ts` module imports has to reach a live
// functions worker. Two mechanisms have to line up for that, and each was
// independently broken:
//
//   1. `moi bundle` must notice. The staleness walk descends into `.server.ts`
//      even though server code never reaches the bundle, because 'built' is
//      what triggers the reload downstream.
//   2. The reload must recycle the worker process. Evicting from the worker's
//      module cache cannot help: `loadModule` busts its import with
//      `?t=<mtime>`, which only makes a new URL for the `.server.ts` itself —
//      whatever that file imports stays pinned in Bun's ESM registry.
//
// This drives the real build and a real worker subprocess, so it fails if
// either half regresses.

// Each `handleBundle` prints its bundle summary.
silenceConsole('log')

let WS: string
let prevFunctionsDir: string | undefined
beforeEach(() => {
  // Inside the repo, not tmpdir: the applet build resolves `tailwindcss` from
  // node_modules up the tree.
  WS = mkdtempSync(join(import.meta.dir, 'moi-srvdep-'))
  // functions.test.ts pins MEI_FUNCTIONS_DIR at its fixtures dir process-wide;
  // point the worker at this workspace regardless of file order.
  prevFunctionsDir = process.env.MEI_FUNCTIONS_DIR
  process.env.MEI_FUNCTIONS_DIR = join(WS, '.moi')
})
afterEach(() => {
  killAllWorkers()
  if (prevFunctionsDir === undefined) delete process.env.MEI_FUNCTIONS_DIR
  else process.env.MEI_FUNCTIONS_DIR = prevFunctionsDir
  rmSync(WS, { recursive: true, force: true })
})

function seed(rel: string, contents: string) {
  const path = join(WS, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, contents)
}

const bundle = () => handleBundle(() => {}, WS)
const rows = async () => parse(await callFunction('widgets/clock', 'rows', stringify([]), WS))

test('editing a helper imported only by a .server.ts reaches a live worker', async () => {
  seed(
    '.moi/widgets/clock.tsx',
    [
      `import { rows } from './clock.server'`,
      `export default function Clock() { return <div>{String(rows)}</div> }`
    ].join('\n')
  )
  seed(
    '.moi/widgets/clock.server.ts',
    [`import { table } from './_schema'`, `export async function rows() { return table }`].join(
      '\n'
    )
  )
  seed('.moi/widgets/_schema.ts', `export const table = 'v1'`)

  await bundle()
  // Spawns the worker and caches both modules in it — the state that used to
  // go stale and stay stale.
  expect(await rows()).toBe('v1')

  seed('.moi/widgets/_schema.ts', `export const table = 'v2'`)
  await bundle()
  expect(await rows()).toBe('v2')
})

test('a bundle that changes no server code leaves the worker alone', async () => {
  seed(
    '.moi/widgets/clock.tsx',
    [
      `import { rows } from './clock.server'`,
      `export default function Clock() { return <div>{String(rows)}</div> }`
    ].join('\n')
  )
  seed(
    '.moi/widgets/clock.server.ts',
    [`let calls = 0`, `export async function rows() { calls++; return calls }`].join('\n')
  )

  await bundle()
  expect(await rows()).toBe(1)
  expect(await rows()).toBe(2)

  // Nothing changed, so nothing rebuilds and the worker keeps its state —
  // the counter would reset to 1 if we recycled on every bundle.
  await bundle()
  expect(await rows()).toBe(3)
})
