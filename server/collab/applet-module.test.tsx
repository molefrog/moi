import { expect, mock, spyOn, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type * as CollabApi from 'moi/collab'

import { COLLAB_MODULE_SOURCE } from './applet-module'

type TestModule = typeof CollabApi & { __attachBridge(bridge: unknown): void }

async function loadModule(): Promise<TestModule> {
  const sources: Record<string, string> = {
    entry: `export * from 'moi/collab'; export { __attachBridge } from 'moi';`,
    'moi/collab': COLLAB_MODULE_SOURCE,
    moi: `let bridge; export function __attachBridge(next) { bridge = next; }
      export function __getBridge() { return bridge; }`
  }
  const result = await Bun.build({
    entrypoints: ['entry'],
    target: 'bun',
    plugins: [
      {
        name: 'collab-module-test',
        setup(build) {
          build.onResolve({ filter: /^(entry|moi(?:\/collab)?)$/ }, args => ({
            path: args.path,
            namespace: 'collab-test'
          }))
          build.onLoad({ filter: /.*/, namespace: 'collab-test' }, args => ({
            contents: sources[args.path]!,
            loader: 'js'
          }))
          build.onResolve({ filter: /^react$/ }, () => ({
            path: Bun.resolveSync('react', import.meta.dir),
            external: true
          }))
        }
      }
    ]
  })
  if (!result.success) throw new Error(result.logs.join('\n'))
  const source = await result.outputs[0]!.text()
  // Each test gets the same generated module with fresh warning/bridge state.
  const url = `data:text/javascript;base64,${Buffer.from(source + `\n// ${crypto.randomUUID()}`).toString('base64')}`
  return (await import(url)) as TestModule
}

test('missing collaboration bridge returns empty hook values and warns once', async () => {
  const api = await loadModule()
  const warning = spyOn(console, 'warn').mockImplementation(() => {})
  try {
    for (const bridge of [undefined, null, {}, { collab: undefined }]) {
      api.__attachBridge(bridge)
      expect(api.useMe()).toBeNull()
      expect(api.useUser('alice')).toBeNull()
      expect(api.usePeers()).toEqual([])
      expect(api.useWorkspaceUsers()).toEqual([])
      expect(api.usePresence('editing')).toEqual([])
      expect(api.usePublishPresence('editing', true)).toBeUndefined()
    }
    expect(warning).toHaveBeenCalledTimes(1)
    expect(warning.mock.calls[0]?.[0]).toContain('Collaboration API is unavailable')
  } finally {
    warning.mockRestore()
  }
})

test('every collaboration component renders nothing without its bridge, including wrapper children', async () => {
  const api = await loadModule()
  const warning = spyOn(console, 'warn').mockImplementation(() => {})
  try {
    const children = 'Applet child content'
    const components = {
      Activity: <api.Activity />,
      User: <api.User id="alice" />,
      Facepile: <api.Facepile ids={['alice']} />,
      Cursors: <api.Cursors>{children}</api.Cursors>,
      Selection: (
        <api.Selection target="task:1" selected>
          {children}
        </api.Selection>
      ),
      PresenceFrame: <api.PresenceFrame target="task:1">{children}</api.PresenceFrame>,
      PresenceGutter: <api.PresenceGutter target="task:1">{children}</api.PresenceGutter>,
      PresenceGroup: <api.PresenceGroup>{children}</api.PresenceGroup>
    }
    for (const component of Object.values(components))
      expect(renderToStaticMarkup(component)).toBe('')
    expect(warning).toHaveBeenCalledTimes(1)
  } finally {
    warning.mockRestore()
  }
})

test('the bridge delegates when attached and falls back again when disposed', async () => {
  const api = await loadModule()
  const warning = spyOn(console, 'warn').mockImplementation(() => {})
  const user: CollabApi.CollabUser = {
    id: 'alice',
    name: 'Alice',
    color: '#123456',
    status: 'active'
  }
  const host = {
    useUser: mock((_id: string) => user),
    usePublishPresence: mock((_channel: string, _value: unknown) => {}),
    User: mock(() => createElement('span', null, 'Alice'))
  }
  let alive = true
  try {
    api.__attachBridge({
      get collab() {
        return alive ? host : undefined
      }
    })
    expect(api.useUser('alice')).toBe(user)
    expect(host.useUser.mock.calls).toEqual([['alice']])
    api.usePublishPresence('editing', { field: 'title' })
    expect(host.usePublishPresence.mock.calls).toEqual([['editing', { field: 'title' }]])
    expect(renderToStaticMarkup(createElement(api.User, { id: 'alice' }))).toBe(
      '<span>Alice</span>'
    )
    expect(warning).not.toHaveBeenCalled()

    alive = false
    expect(api.useUser('alice')).toBeNull()
    api.usePublishPresence('editing', false)
    expect(renderToStaticMarkup(createElement(api.User, { id: 'alice' }))).toBe('')
    expect(host.usePublishPresence).toHaveBeenCalledTimes(1)
    expect(host.User).toHaveBeenCalledTimes(1)
    expect(warning).toHaveBeenCalledTimes(1)

    alive = true
    expect(api.useUser('alice')).toBe(user)
  } finally {
    warning.mockRestore()
  }
})
