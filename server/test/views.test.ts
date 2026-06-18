import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'path'

import {
  buildAllViews,
  collectViewRequiredEnv,
  listViews,
  reconcileOrder,
  serveView
} from '../views'

// These tests exercise the view orchestration logic WITHOUT invoking Bun.build:
// they seed `.moi/.build/views/` with stub `.js` files + a manifest and call the
// read paths. The actual compile path (kind='view') is covered in
// build-applet.test.ts, and end-to-end via `moi bundle`.

let WS: string

function buildDir(): string {
  return join(WS, '.moi', '.build', 'views')
}

// Seed built bundles (stub JS) + a manifest for the orchestration read paths.
function seed(jsNames: string[], manifest: object) {
  const dir = buildDir()
  mkdirSync(dir, { recursive: true })
  for (const name of jsNames) writeFileSync(join(dir, `${name}.js`), `// ${name}`)
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest))
}

async function views(): Promise<
  { id: string; config: { title?: string; requiredEnv?: string[] } }[]
> {
  const res = await listViews(WS)
  return (await res.json()).views
}

beforeEach(() => {
  WS = mkdtempSync(join(import.meta.dir, 'moi-vtest-'))
})
afterEach(() => {
  rmSync(WS, { recursive: true, force: true })
})

describe('reconcileOrder', () => {
  test('appends newly-seen names in scan order', () => {
    expect(reconcileOrder([], ['a', 'b'])).toEqual(['a', 'b'])
    expect(reconcileOrder(['a', 'b'], ['a', 'b', 'c'])).toEqual(['a', 'b', 'c'])
  })

  test('keeps existing order and drops deleted names', () => {
    // `b` deleted; `a` and `c` keep their original relative order.
    expect(reconcileOrder(['a', 'b', 'c'], ['c', 'a'])).toEqual(['a', 'c'])
  })

  test('a pre-existing name keeps its slot ahead of a new one', () => {
    // `a` already had a slot; `b` is new and appends after it, regardless of
    // the (arbitrary) scan order it arrives in.
    expect(reconcileOrder(['a'], ['b', 'a'])).toEqual(['a', 'b'])
  })
})

describe('listViews', () => {
  test('returns views in manifest order, title falling back to the id', async () => {
    seed(['crm', 'tasks'], {
      config: { crm: { title: 'CRM' }, tasks: {} },
      order: ['tasks', 'crm']
    })
    expect(await views()).toEqual([
      { id: 'tasks', config: { title: 'tasks' } },
      { id: 'crm', config: { title: 'CRM' } }
    ])
  })

  test('passes through requiredEnv', async () => {
    seed(['crm'], { config: { crm: { title: 'CRM', requiredEnv: ['K'] } }, order: ['crm'] })
    expect((await views())[0].config).toEqual({ title: 'CRM', requiredEnv: ['K'] })
  })

  test('appends a built view missing from order', async () => {
    seed(['a', 'b'], { config: {}, order: ['b'] })
    expect((await views()).map(v => v.id)).toEqual(['b', 'a'])
  })

  test('excludes an ordered view that is not built', async () => {
    seed(['a'], { config: {}, order: ['a', 'ghost'] })
    expect((await views()).map(v => v.id)).toEqual(['a'])
  })

  test('empty when nothing is built', async () => {
    expect(await views()).toEqual([])
  })
})

describe('collectViewRequiredEnv', () => {
  test('maps each env key to the view ids that asked for it', async () => {
    seed(['crm', 'x'], {
      config: { crm: { requiredEnv: ['K1', 'K2'] }, x: { requiredEnv: ['K1'] } },
      order: ['crm', 'x']
    })
    expect(await collectViewRequiredEnv(WS)).toEqual({ K1: ['crm', 'x'], K2: ['crm'] })
  })

  test('empty object when there is no manifest', async () => {
    expect(await collectViewRequiredEnv(WS)).toEqual({})
  })
})

describe('serveView', () => {
  test('serves a built bundle as javascript', async () => {
    seed(['crm'], { config: { crm: {} }, order: ['crm'] })
    const res = await serveView('crm', WS)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/javascript')
    expect(await res.text()).toBe('// crm')
  })

  test('404 for a view that is not built', async () => {
    seed(['crm'], { config: { crm: {} }, order: ['crm'] })
    expect((await serveView('missing', WS)).status).toBe(404)
  })

  test('400 for an invalid name', async () => {
    expect((await serveView('../etc', WS)).status).toBe(400)
    expect((await serveView('a b', WS)).status).toBe(400)
  })
})

describe('buildAllViews', () => {
  test('returns no results when there is no views directory', async () => {
    expect(await buildAllViews(WS)).toEqual([])
  })
})
