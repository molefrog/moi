import { describe, expect, test } from 'bun:test'

import {
  appletForModule,
  clearAppletLog,
  getAppletLog,
  getAppletLogCount,
  recordAppletError,
  syncAppletLogAfterBuild
} from '../applet-log'

// The journal is keyed by workspace path, so each test isolates itself with a
// unique fake path — no shared state between tests.
let n = 0
const wsPath = () => `/fake/workspace-${++n}`

describe('recordAppletError / getAppletLog', () => {
  test('records an entry with count 1', () => {
    const ws = wsPath()
    recordAppletError(ws, { source: 'render', kind: 'widget', name: 'hello', message: 'boom' })
    const entries = getAppletLog(ws)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      source: 'render',
      kind: 'widget',
      name: 'hello',
      message: 'boom',
      count: 1
    })
    expect(entries[0].ts).toBeGreaterThan(0)
  })

  test('dedups identical errors into a count and moves them to the tail', () => {
    const ws = wsPath()
    recordAppletError(ws, { source: 'render', kind: 'widget', name: 'a', message: 'boom' })
    recordAppletError(ws, { source: 'render', kind: 'widget', name: 'b', message: 'other' })
    recordAppletError(ws, { source: 'render', kind: 'widget', name: 'a', message: 'boom' })
    const entries = getAppletLog(ws)
    expect(entries).toHaveLength(2)
    // The repeated entry moved to the tail with a bumped count.
    expect(entries[1]).toMatchObject({ name: 'a', count: 2 })
    expect(entries[0]).toMatchObject({ name: 'b', count: 1 })
  })

  test('a different message is a separate entry', () => {
    const ws = wsPath()
    recordAppletError(ws, { source: 'rpc', module: 'widgets/a', fn: 'f', message: 'x' })
    recordAppletError(ws, { source: 'rpc', module: 'widgets/a', fn: 'f', message: 'y' })
    expect(getAppletLog(ws)).toHaveLength(2)
  })

  test('caps the journal at 100 entries, dropping the oldest', () => {
    const ws = wsPath()
    for (let i = 0; i < 120; i++) {
      recordAppletError(ws, { source: 'window', kind: 'widget', name: 'w', message: `err ${i}` })
    }
    const entries = getAppletLog(ws)
    expect(entries).toHaveLength(100)
    expect(entries[0].message).toBe('err 20')
    expect(entries[99].message).toBe('err 119')
  })

  test('caps message and stack lengths', () => {
    const ws = wsPath()
    recordAppletError(ws, {
      source: 'load',
      kind: 'view',
      name: 'v',
      message: 'm'.repeat(5000),
      stack: 's'.repeat(10_000)
    })
    const [e] = getAppletLog(ws)
    expect(e.message.length).toBe(1000)
    expect(e.stack?.length).toBe(4000)
  })

  test('returned entries are copies — mutating them does not touch the journal', () => {
    const ws = wsPath()
    recordAppletError(ws, { source: 'build', kind: 'widget', name: 'w', message: 'fail' })
    getAppletLog(ws)[0].message = 'mutated'
    expect(getAppletLog(ws)[0].message).toBe('fail')
  })
})

describe('clearAppletLog', () => {
  test('empties the journal and reports how many were dropped', () => {
    const ws = wsPath()
    recordAppletError(ws, { source: 'rpc', module: 'lib/db', fn: 'q', message: 'x' })
    recordAppletError(ws, { source: 'rpc', module: 'lib/db', fn: 'q', message: 'y' })
    expect(clearAppletLog(ws)).toBe(2)
    expect(getAppletLogCount(ws)).toBe(0)
  })
})

describe('appletForModule', () => {
  test('attributes widget and view modules', () => {
    expect(appletForModule('widgets/hello')).toEqual({ kind: 'widget', name: 'hello' })
    expect(appletForModule('views/crm')).toEqual({ kind: 'view', name: 'crm' })
  })

  test('shared and nested modules attribute to nothing', () => {
    expect(appletForModule('lib/db')).toBeNull()
    expect(appletForModule('widgets/a/b')).toBeNull()
    expect(appletForModule('widgets')).toBeNull()
  })
})

describe('syncAppletLogAfterBuild', () => {
  test('records build failures', () => {
    const ws = wsPath()
    syncAppletLogAfterBuild(ws, 'widget', [{ name: 'bad', status: 'failed', error: 'no parse' }])
    expect(getAppletLog(ws)[0]).toMatchObject({
      source: 'build',
      kind: 'widget',
      name: 'bad',
      message: 'no parse'
    })
  })

  test('a successful rebuild clears the applet entries and its rpc modules', () => {
    const ws = wsPath()
    recordAppletError(ws, { source: 'render', kind: 'widget', name: 'a', message: 'boom' })
    recordAppletError(ws, { source: 'rpc', module: 'widgets/a', fn: 'f', message: 'rpc boom' })
    recordAppletError(ws, { source: 'rpc', module: 'lib/db', fn: 'q', message: 'db boom' })
    syncAppletLogAfterBuild(ws, 'widget', [
      { name: 'a', status: 'built', serverModules: ['widgets/a'] },
      { name: 'db-widget', status: 'built', serverModules: ['lib/db'] }
    ])
    expect(getAppletLog(ws)).toHaveLength(0)
  })

  test('a skipped applet keeps its standing entries', () => {
    const ws = wsPath()
    recordAppletError(ws, { source: 'render', kind: 'widget', name: 'a', message: 'boom' })
    syncAppletLogAfterBuild(ws, 'widget', [{ name: 'a', status: 'skipped' }])
    expect(getAppletLog(ws)).toHaveLength(1)
  })

  test('entries for deleted applets are swept', () => {
    const ws = wsPath()
    recordAppletError(ws, { source: 'load', kind: 'widget', name: 'gone', message: 'boom' })
    syncAppletLogAfterBuild(ws, 'widget', [{ name: 'other', status: 'skipped' }])
    expect(getAppletLog(ws)).toHaveLength(0)
  })

  test('only touches its own kind', () => {
    const ws = wsPath()
    recordAppletError(ws, { source: 'render', kind: 'view', name: 'a', message: 'boom' })
    syncAppletLogAfterBuild(ws, 'widget', [{ name: 'a', status: 'built' }])
    expect(getAppletLog(ws)).toHaveLength(1)
  })

  test('a failed rebuild keeps older runtime entries and adds the build error', () => {
    const ws = wsPath()
    recordAppletError(ws, { source: 'render', kind: 'widget', name: 'a', message: 'boom' })
    syncAppletLogAfterBuild(ws, 'widget', [{ name: 'a', status: 'failed', error: 'oops' }])
    const entries = getAppletLog(ws)
    expect(entries).toHaveLength(2)
    expect(entries.map(e => e.source).sort()).toEqual(['build', 'render'])
  })
})
