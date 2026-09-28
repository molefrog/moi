export type CollabJsonValue =
  | null
  | boolean
  | number
  | string
  | CollabJsonValue[]
  | { [key: string]: CollabJsonValue }

export type UserProfile = {
  id: string
  name?: string
  color: string
  avatar?: string
  email?: string
}

// An authenticating proxy in front of the deployment that moi trusts.
export type IdentityProvider = 'cloudflare-access'

// GET /api/identity. `profile` is the user the proxy verified for this
// request: null without a configured provider or without a valid proxy token.
export type ProxyIdentity = {
  provider: IdentityProvider | null
  profile: UserProfile | null
}

export type CollabLocation = { page: string; title?: string; away?: boolean }

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
  | { type: 'join'; version: 2; profile: UserProfile; location?: CollabLocation | null }
  | { type: 'profile'; profile: UserProfile }
  | { type: 'location'; location: CollabLocation | null }
  | ({ type: 'presence:set' } & CollabPresenceRegistration)
  | { type: 'presence:delete'; registrationId: string }
  | { type: 'ping' }

export type CollabServerMessage =
  | {
      type: 'welcome'
      version: 2
      connectionId: string
      connections: Connection[]
      // Profile fallback for currently connected users only. The host owns
      // the full workspace directory, including users who are offline.
      users: UserProfile[]
    }
  | { type: 'connections'; connections: Connection[]; users: UserProfile[] }
  | { type: 'error'; code: string; message: string }
  | { type: 'pong' }
