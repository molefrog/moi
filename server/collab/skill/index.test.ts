import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type * as CollabApi from 'moi/collab'

import type * as Components from '@/client/features/collab/components'
import type * as Hooks from '@/client/features/collab/hooks'
import type { WorkspaceType } from '@/lib/types'

import { provisionWorkspace, skillsDirFor } from '../../workspace-init'
import { COLLAB_REFERENCE_SOURCE_PATH, installCollabSkill, removeCollabSkill } from './index'

type ActualHooks = Pick<
  typeof Hooks,
  'useSelf' | 'useOthers' | 'usePerson' | 'usePresence' | 'useSharedState' | 'useSharedStore'
>
type ActualComponents = Pick<
  typeof Components,
  | 'Activity'
  | 'Cursor'
  | 'Cursors'
  | 'Facepile'
  | 'Person'
  | 'PresenceField'
  | 'PresenceFrame'
  | 'PresenceGutter'
  | 'Selection'
>
// This assignment is checked by tsc without importing React into the server.
const declarationsMatch: ActualHooks & ActualComponents extends typeof CollabApi ? true : false =
  true

const directories: string[] = []

afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true })
})

test('optional collab reference installs beside the default skill without changing it', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'moi-collab-skill-'))
  directories.push(workspace)
  const installed = await installCollabSkill(workspace, 'codex')
  expect(installed.referencePath).toBe(
    join(workspace, '.agents', 'skills', 'moi-workspace', 'references', 'COLLABORATIVE.md')
  )
  expect(installed.typesPath).toBe(join(workspace, '.moi', 'collab-env.d.ts'))
  expect(await readFile(installed.referencePath, 'utf8')).toBe(
    await readFile(COLLAB_REFERENCE_SOURCE_PATH, 'utf8')
  )
  const defaultSkill = join(dirname(dirname(installed.referencePath)), 'SKILL.md')
  const marker = '# Existing workspace skill\nLeave its authored instructions alone.\n'
  await writeFile(defaultSkill, marker)
  const before = await stat(installed.referencePath)
  await installCollabSkill(workspace, 'codex')
  expect((await stat(installed.referencePath)).mtimeMs).toBe(before.mtimeMs)
  expect(await readFile(defaultSkill, 'utf8')).toBe(marker)
  await removeCollabSkill(workspace, 'codex')
  expect(await Bun.file(installed.referencePath).exists()).toBe(false)
  expect(await Bun.file(installed.typesPath).exists()).toBe(false)
  expect(await readFile(defaultSkill, 'utf8')).toBe(marker)
})

test('workspace declarations match the public hooks and components', () => {
  expect(declarationsMatch).toBe(true)
})

test('optional guide uses each harness skill directory', async () => {
  const types: WorkspaceType[] = ['claude-code', 'codex', 'openclaw', 'hermes']
  for (const type of types) {
    const workspace = await mkdtemp(join(tmpdir(), 'moi-collab-harness-'))
    directories.push(workspace)
    const { referencePath } = await installCollabSkill(workspace, type)
    expect(referencePath).toBe(
      join(skillsDirFor(workspace, type), 'moi-workspace', 'references', 'COLLABORATIVE.md')
    )
    expect(await Bun.file(referencePath).exists()).toBe(true)
  }
})

test('ordinary workspace provisioning omits collab and preserves a manually installed guide', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'moi-collab-provision-'))
  directories.push(workspace)
  // An existing scaffold skips dependency installation; this exercises the
  // same provisioning path used by ordinary init and the UI.
  await Bun.write(join(workspace, '.moi', 'package.json'), '{}\n')
  await provisionWorkspace(workspace, 'codex')
  const referencePath = join(
    skillsDirFor(workspace, 'codex'),
    'moi-workspace',
    'references',
    'COLLABORATIVE.md'
  )
  const typesPath = join(workspace, '.moi', 'collab-env.d.ts')
  expect(await Bun.file(referencePath).exists()).toBe(false)
  expect(await Bun.file(typesPath).exists()).toBe(false)
  await installCollabSkill(workspace, 'codex')
  const reference = await Bun.file(referencePath).text()
  const declarations = await Bun.file(typesPath).text()
  await provisionWorkspace(workspace, 'codex')
  expect(await Bun.file(referencePath).text()).toBe(reference)
  expect(await Bun.file(typesPath).text()).toBe(declarations)
})
