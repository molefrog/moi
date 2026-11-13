import { expect, test } from 'bun:test'
import { homeWorkspaces } from './shared-workspaces'

test('keeps saved registration order with unopened shares first, deduplicated by owner and workspace', () => {
  const result = homeWorkspaces(
    [
      { id: 'local', path: '/Zebra', addedAt: '', name: 'Zebra' },
      {
        id: 'alias',
        path: '/visitor',
        addedAt: '',
        name: 'Bravo',
        remote: { user_id: 'alice', workspace_id: 'board' }
      },
      {
        id: 'manual',
        path: '/manual',
        addedAt: '',
        name: 'Delta',
        remote: { user_id: 'carol', workspace_id: 'board' }
      }
    ],
    [
      { id: 'board', owner: { id: 'alice', name: 'Alice' }, name: 'Bravo' },
      { id: 'board', owner: { id: 'bob', name: 'Bob' }, name: 'alpha' }
    ]
  )
  expect(result.map(item => item.name)).toEqual(['alpha', 'Zebra', 'Bravo', 'Delta'])
  expect(result.map(item => item.href)).toEqual([
    '/workspace/bob:board',
    '/workspace/local',
    '/workspace/alias',
    '/workspace/manual'
  ])
})

test('without unopened shares, preserves the registry order exactly', () => {
  const entries = [
    { id: 'z', path: '/Zebra', addedAt: '' },
    { id: 'a', path: '/Alpha', addedAt: '' }
  ]
  expect(homeWorkspaces(entries, []).map(item => item.id)).toEqual(['z', 'a'])
  expect(homeWorkspaces([...entries].reverse(), []).map(item => item.id)).toEqual(['a', 'z'])
})
