import { expect, mock, spyOn, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type * as CollabApi from 'moi/collab'
import type * as CollabRuntime from './collab'

type TestModule = typeof CollabApi & { __attachBridge(bridge: unknown): void }
type RuntimeModule = typeof CollabRuntime & { __attachBridge(bridge: unknown): void }

async function loadModule(): Promise<TestModule> {
  const result = await Bun.build({
    entrypoints: ['entry'],
    target: 'bun',
    plugins: [
      {
        name: 'collab-module-test',
        setup(build) {
          build.onResolve({ filter: /^entry$/ }, args => ({
            path: args.path,
            namespace: 'collab-test'
          }))
          build.onLoad({ filter: /.*/, namespace: 'collab-test' }, () => ({
            contents: `export * from 'moi/collab'; export { __attachBridge } from 'moi';`,
            loader: 'js'
          }))
          build.onResolve({ filter: /^moi\/collab$/ }, () => ({
            path: join(import.meta.dir, 'collab.ts')
          }))
          build.onResolve({ filter: /^moi$/ }, () => ({
            path: join(import.meta.dir, 'moi.ts')
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
  // Each test gets a fresh bundle with its own warning/bridge state.
  const directory = await mkdtemp(join(import.meta.dir, '.collab-module-test-'))
  try {
    const path = join(directory, 'entry.mjs')
    await Bun.write(path, source)
    return (await import(path)) as RuntimeModule
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

test('missing collaboration bridge returns empty hook values and warns once', async () => {
  const api = await loadModule()
  const warning = spyOn(console, 'warn').mockImplementation(() => {})
  try {
    for (const bridge of [undefined, null, {}, { collab: undefined }]) {
      api.__attachBridge(bridge)
      expect(api.useMe()).toBeUndefined()
      expect(api.useUser('alice')).toBeUndefined()
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
    const children = <span>Applet child content</span>
    const components = {
      Activity: <api.Activity />,
      User: <api.User id="alice" />,
      Facepile: <api.Facepile ids={['alice']} />,
      Cursors: <api.Cursors>{children}</api.Cursors>,
      Selection: (
        <api.Selection id="task:1" selected>
          {children}
        </api.Selection>
      ),
      PresenceFrame: <api.PresenceFrame id="task:1">{children}</api.PresenceFrame>,
      PresenceGutter: <api.PresenceGutter id="task:1">{children}</api.PresenceGutter>,
      PresenceGroup: <api.PresenceGroup id="tasks">{children}</api.PresenceGroup>
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
  const user: CollabApi.WorkspaceUser = {
    id: 'alice',
    name: 'Alice',
    color: 'blue',
    status: 'active'
  }
  const host = {
    useUser: mock((_id: string) => user),
    useWorkspaceUsers: mock((_options?: CollabApi.UseWorkspaceUsersOptions) => [user]),
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
    expect(api.useWorkspaceUsers({ status: 'active' })).toEqual([user])
    expect(host.useWorkspaceUsers.mock.calls).toEqual([[{ status: 'active' }]])
    expect(host.useUser.mock.calls).toEqual([['alice']])
    api.usePublishPresence('editing', { field: 'title' })
    expect(host.usePublishPresence.mock.calls).toEqual([['editing', { field: 'title' }]])
    expect(renderToStaticMarkup(createElement(api.User, { id: 'alice' }))).toBe(
      '<span>Alice</span>'
    )
    expect(warning).not.toHaveBeenCalled()

    alive = false
    expect(api.useUser('alice')).toBeUndefined()
    expect(api.useWorkspaceUsers()).toEqual([])
    api.usePublishPresence('editing', false)
    expect(renderToStaticMarkup(createElement(api.User, { id: 'alice' }))).toBe('')
    expect(host.usePublishPresence).toHaveBeenCalledTimes(1)
    expect(host.useWorkspaceUsers).toHaveBeenCalledTimes(1)
    expect(host.User).toHaveBeenCalledTimes(1)
    expect(warning).toHaveBeenCalledTimes(1)

    alive = true
    expect(api.useUser('alice')).toBe(user)
  } finally {
    warning.mockRestore()
  }
})
