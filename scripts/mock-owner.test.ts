import { afterAll, beforeAll, expect, test } from 'bun:test'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let root: string
let origin: string
let child: Bun.Subprocess
const viewer = {
  id: 'visitor',
  type: 'user',
  name: 'Visitor',
  email: 'visitor@example.com',
  isAnonymous: false
}
const remoteConfig = {
  version: 2,
  remote: { user_id: 'alice', workspace_id: 'owner-board' },
  layoutMode: 'fullscreen'
}
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'moi-mock-test-'))
  await mkdir(join(root, 'owner-board/.moi'), { recursive: true })
  await mkdir(join(root, 'visitor/.moi'), { recursive: true })
  await Bun.write(
    join(root, 'owner-board/.moi/.workspace.json'),
    JSON.stringify({
      version: 1,
      name: 'Shared counter',
      widgetGrid: [{ i: 'counter', x: 0, y: 0 }],
      selectedModel: 'keep-model'
    })
  )
  await Bun.write(join(root, 'owner-board/.moi/count.json'), '7')
  await Bun.write(join(root, 'visitor/.moi/.workspace.json'), JSON.stringify(remoteConfig))
  const spawned = Bun.spawn([process.execPath, 'scripts/mock-owner.ts'], {
    cwd: join(import.meta.dir, '..'),
    env: {
      ...process.env,
      MOCK_OWNER_DATA_DIR: root,
      MOCK_VISITOR_DIR: join(root, 'visitor'),
      MOCK_OWNER_PORT: '0'
    },
    stdout: 'pipe',
    stderr: 'inherit'
  })
  child = spawned
  let output = ''
  const reader = spawned.stdout.getReader()
  try {
    while (!origin) {
      const chunk = await reader.read()
      if (chunk.done) throw new Error(`Mock exited: ${output}`)
      output += new TextDecoder().decode(chunk.value)
      origin = /Mock owner: (http:\/\/[^/]+)/.exec(output)?.[1] ?? ''
    }
  } finally {
    reader.releaseLock()
  }
}, 30_000)
afterAll(async () => {
  child?.kill('SIGTERM')
  if (child) await child.exited
  if (root) await rm(root, { recursive: true, force: true })
})
function sharing(path: string, init?: RequestInit) {
  return fetch(origin + '/mock/sharing' + path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-moi-mock-viewer': encodeURIComponent(JSON.stringify(viewer))
    }
  })
}
test('legacy fixture gets the Views widget without resetting counter or visitor settings', async () => {
  const layout = await (await fetch(origin + '/api/workspaces/owner-board')).json()
  expect(layout.widgetGrid.map((item: { i: string }) => item.i)).toEqual(['_moi_views', 'counter'])
  expect(layout.selectedModel).toBe('keep-model')
  expect(await Bun.file(join(root, 'owner-board/.moi/count.json')).json()).toBe(7)
  expect(await Bun.file(join(root, 'visitor/.moi/.workspace.json')).json()).toEqual(remoteConfig)
  const { views } = await (await fetch(origin + '/api/workspaces/owner-board/views')).json()
  expect(views.some((view: { id: string }) => view.id === 'counter')).toBe(true)
})
test('mock membership supports invites, revocation and removal while keeping the host', async () => {
  expect((await fetch(origin + '/mock/sharing/members')).status).toBe(401)
  let snapshot = await (await sharing('/members')).json()
  expect(snapshot.members.map((member: { id: string }) => member.id)).toEqual([
    'alice',
    'jamie',
    'visitor'
  ])
  expect(
    (
      await sharing('/invitations', {
        method: 'POST',
        body: JSON.stringify({ email: 'NEW@example.com' })
      })
    ).status
  ).toBe(200)
  snapshot = await (await sharing('/members')).json()
  expect(snapshot.invitations[0].email).toBe('new@example.com')
  expect(
    (await sharing('/invitations/' + snapshot.invitations[0].id, { method: 'DELETE' })).status
  ).toBe(200)
  expect((await sharing('/members/member-jamie', { method: 'DELETE' })).status).toBe(200)
  expect((await sharing('/members/alice', { method: 'DELETE' })).status).toBe(404)
  snapshot = await (await sharing('/members')).json()
  expect(snapshot.invitations).toEqual([])
  expect(snapshot.members.map((member: { id: string }) => member.id)).toEqual(['alice', 'visitor'])
})
