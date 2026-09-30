import type { CollabJsonValue, UserProfile } from 'moi/collab'

export type { CollabJsonValue, UserProfile } from 'moi/collab'

// An authenticating proxy in front of the deployment that moi trusts.
export type AuthProvider = 'cloudflare-access'

// Complete snapshot from GET /api/proxy-user. No provider means no proxy;
// a provider without a profile means no verified user.
export type ProxyUserState = {
  provider?: AuthProvider
  profile?: UserProfile
}

export type CollabLocation = { page: string; away?: boolean }

export type CollabPresenceRegistration = {
  registrationId: string
  surface: string
  channel: string
  value: CollabJsonValue
}

export type Connection = {
  connectionId: string
  userId: string
  location: CollabLocation | null
  presence: CollabPresenceRegistration[]
}

export type CollabClientMessage =
  | { type: 'join'; version: 1; profile: UserProfile; location?: CollabLocation | null }
  | { type: 'profile'; profile: UserProfile }
  | { type: 'location'; location: CollabLocation | null }
  | ({ type: 'presence:set' } & CollabPresenceRegistration)
  | { type: 'presence:delete'; registrationId: string }
  | { type: 'ping' }

export type CollabServerMessage =
  | {
      type: 'welcome'
      version: 1
      connectionId: string
      connections: Connection[]
      // Profile fallback for currently connected users only. The host owns
      // the full workspace directory, including users who are offline.
      users: UserProfile[]
    }
  | { type: 'connections'; connections: Connection[]; users: UserProfile[] }
  | { type: 'error'; code: string; message: string }
  | { type: 'pong' }
