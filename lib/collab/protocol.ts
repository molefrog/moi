import type { CollabClientMessage, CollabIdentity, CollabJsonValue, CollabLocation } from './types'

export const COLLAB_PROTOCOL_VERSION = 2
export const COLLAB_MAX_MESSAGE_BYTES = 256 * 1024
export const COLLAB_MAX_PRESENCE_BYTES = 4 * 1024
export const COLLAB_MAX_AVATAR_BYTES = 8 * 1024
export const COLLAB_MAX_EMAIL_BYTES = 320

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isCollabString(value: unknown, max = 256): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !value.includes('\0') &&
    new TextEncoder().encode(value).length <= max
  )
}

export function isCollabJson(value: unknown, depth = 0): value is CollabJsonValue {
  if (depth > 24) return false
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(item => isCollabJson(item, depth + 1))
  if (!isRecord(value)) return false
  return Object.values(value).every(item => isCollabJson(item, depth + 1))
}

export function isCollabIdentity(value: unknown): value is CollabIdentity {
  return (
    isRecord(value) &&
    isCollabString(value.id, 240) &&
    isCollabString(value.name) &&
    isCollabString(value.color, 64) &&
    (value.avatar === undefined || isCollabString(value.avatar, COLLAB_MAX_AVATAR_BYTES)) &&
    (value.email === undefined || isCollabString(value.email, COLLAB_MAX_EMAIL_BYTES))
  )
}

function isLocation(value: unknown): value is CollabLocation | null {
  return (
    value === null ||
    (isRecord(value) &&
      isCollabString(value.page, 1024) &&
      (value.title === undefined || isCollabString(value.title)))
  )
}

export function isCollabClientMessage(value: unknown): value is CollabClientMessage {
  if (!isRecord(value)) return false
  switch (value.type) {
    case 'join':
      return (
        value.version === COLLAB_PROTOCOL_VERSION &&
        isCollabIdentity(value.identity) &&
        (value.location === undefined || isLocation(value.location))
      )
    case 'identity':
      return isCollabIdentity(value.identity)
    case 'location':
      return isLocation(value.location)
    case 'presence:set':
      return (
        isCollabString(value.registrationId) &&
        isCollabString(value.surface) &&
        isCollabString(value.channel) &&
        isCollabJson(value.value) &&
        new TextEncoder().encode(JSON.stringify(value.value)).length <= COLLAB_MAX_PRESENCE_BYTES
      )
    case 'presence:delete':
      return isCollabString(value.registrationId)
    case 'ping':
      return true
    default:
      return false
  }
}
