import type { JsonValue } from 'moi'
import type { ConnectionStatus, UserProfile } from 'moi/collab'

export type { ConnectionStatus, UserProfile } from 'moi/collab'

// An authenticating proxy in front of the deployment that moi trusts.
export type AuthProvider = 'cloudflare-access'

// Complete snapshot from GET /api/proxy-user. No provider means no proxy;
// a provider without a profile means no verified user.
export type ProxyUserState = {
  provider?: AuthProvider
  profile?: UserProfile
}

export type ConnectionLocation = { page: string; status: ConnectionStatus }

export type PresenceRegistration = {
  registrationId: string
  appletId: string
  channel: string
  value: JsonValue
}

export type Connection = {
  connectionId: string
  userId: string
  location: ConnectionLocation | null
  presence: PresenceRegistration[]
}

export type CollabClientMessage =
  | { type: 'join'; version: 1; profile: UserProfile; location?: ConnectionLocation | null }
  | { type: 'profile'; profile: UserProfile }
  | { type: 'location'; location: ConnectionLocation | null }
  | ({ type: 'presence:set' } & PresenceRegistration)
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
