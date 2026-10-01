import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import type { PresenceRegistration, UserProfile } from '@/lib/collab/types'

import { AppletPresenceProvider, CollabContext } from '../provider'
import { presenceChannels } from '../hooks'
import { presenceTarget } from '../presence-target'
import { createFakeEngine } from './fake-engine'
import type { FakeEngine } from './fake-engine'

export const me: UserProfile = { id: 'me', name: 'Me', color: 'blue' }
export const peer: UserProfile = { id: 'peer', name: 'Ada', color: 'cyan' }
export const namelessUsers = [
  [{ id: 'user-id', color: 'cyan' }, 'user-id'],
  [{ id: 'user-id', name: '', color: 'cyan' }, 'user-id'],
  [{ id: 'user-id', name: '   ', email: 'user@example.test', color: 'cyan' }, 'user@example.test'],
  [{ id: 'user-id', email: 'user@example.test', color: 'cyan' }, 'user@example.test']
] satisfies Array<[UserProfile, string]>

export function createRoom(profile: UserProfile = peer, presence: PresenceRegistration[] = []) {
  return createFakeEngine({
    self: me,
    page: 'board',
    users: [me, profile],
    otherConnections: [
      {
        connectionId: 'remote',
        userId: profile.id,
        location: { page: 'board', status: 'active' },
        presence
      }
    ]
  })
}

export function createFocusRoom(target = presenceTarget('task:42:title'), profile = peer) {
  return createRoom(profile, [
    {
      registrationId: 'focus',
      appletId: 'views/board',
      channel: presenceChannels.target(target),
      value: true
    }
  ])
}

export function renderCollab(backend: FakeEngine, children: ReactNode, active = true) {
  return renderToStaticMarkup(
    <CollabContext value={backend}>
      <AppletPresenceProvider appletId="views/board" active={active}>
        {children}
      </AppletPresenceProvider>
    </CollabContext>
  )
}
