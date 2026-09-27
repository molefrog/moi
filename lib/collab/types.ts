export type CollabJsonValue =
  | null
  | boolean
  | number
  | string
  | CollabJsonValue[]
  | { [key: string]: CollabJsonValue }

export type CollabIdentity = {
  id: string
  name: string
  color: string
  avatar?: string
  email?: string
}

// An authenticating proxy in front of the deployment that moi trusts for identity.
export type CollabIdentityProvider = 'cloudflare-access'

// GET /api/identity. `identity` is the profile the proxy verified for this
// request: null without a configured provider or without a valid proxy token.
export type ProxyIdentity = {
  provider: CollabIdentityProvider | null
  identity: CollabIdentity | null
}

export type CollabLocation = { page: string; title?: string; away?: boolean }

export type CollabPresenceRegistration = {
  registrationId: string
  surface: string
  channel: string
  value: CollabJsonValue
}

export type CollabParticipant = {
  connectionId: string
  userId: string
  location: CollabLocation | null
  presence: CollabPresenceRegistration[]
}

export type CollabClientMessage =
  | { type: 'join'; version: 2; identity: CollabIdentity; location?: CollabLocation | null }
  | { type: 'identity'; identity: CollabIdentity }
  | { type: 'location'; location: CollabLocation | null }
  | ({ type: 'presence:set' } & CollabPresenceRegistration)
  | { type: 'presence:delete'; registrationId: string }
  | { type: 'ping' }

export type CollabServerMessage =
  | {
      type: 'welcome'
      version: 2
      connectionId: string
      participants: CollabParticipant[]
      // Profile fallback for currently connected users only. The host owns
      // the full workspace directory, including users who are offline.
      users: CollabIdentity[]
    }
  | { type: 'participants'; participants: CollabParticipant[]; users: CollabIdentity[] }
  | { type: 'error'; code: string; message: string }
  | { type: 'pong' }
