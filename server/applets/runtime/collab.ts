// Browser-only runtime. State and React contexts belong to the host feature.
import { createElement } from 'react'
import type { JsonValue } from 'moi'
import type {
  ActivityProps,
  CursorsProps,
  FacepileProps,
  PresenceFrameProps,
  PresenceGroupProps,
  PresenceGutterProps,
  PresenceValue,
  SelectionProps,
  UserProps,
  UserAvatarProps,
  UsePeersOptions,
  UseWorkspaceUsersOptions
} from 'moi/collab'
import type { AppletCollabApi } from '../../../client/features/collab/applet-api'

import { __getBridge } from './moi'

type Bridge = { readonly collab?: AppletCollabApi }

function empty(): never[] {
  return []
}
const nothing = () => null
const fallback = {
  useMe: () => undefined,
  useUser: () => undefined,
  usePeers: empty,
  useWorkspaceUsers: empty,
  usePresence<T extends JsonValue>(_channel: string): PresenceValue<T>[] {
    return []
  },
  usePublishPresence() {},
  Cursors: nothing,
  Activity: nothing,
  Selection: nothing,
  User: nothing,
  UserAvatar: nothing,
  Facepile: nothing,
  PresenceFrame: nothing,
  PresenceGroup: nothing,
  PresenceGutter: nothing
}
let warned = false
function api() {
  const collab = (__getBridge() as Bridge | null)?.collab
  if (collab) return collab
  if (!warned) {
    warned = true
    console.warn(
      '[moi/collab] Collaboration API is unavailable. Hooks return empty values and components render nothing.'
    )
  }
  return fallback
}

export function useMe() {
  return api().useMe()
}
export function usePeers(options?: UsePeersOptions) {
  return api().usePeers(options)
}
export function useUser(id: string) {
  return api().useUser(id)
}
export function useWorkspaceUsers(options?: UseWorkspaceUsersOptions) {
  return api().useWorkspaceUsers(options)
}
export function usePresence<T extends JsonValue>(channel: string) {
  return api().usePresence<T>(channel)
}
export function usePublishPresence<T extends JsonValue>(channel: string, value: T) {
  return api().usePublishPresence(channel, value)
}
export function Cursors(props: CursorsProps) {
  return createElement(api().Cursors, props)
}
export function Activity(props: ActivityProps) {
  return createElement(api().Activity, props)
}
export function Selection(props: SelectionProps) {
  return createElement(api().Selection, props)
}
export function User(props: UserProps) {
  return createElement(api().User, props)
}
export function UserAvatar(props: UserAvatarProps) {
  return createElement(api().UserAvatar, props)
}
export function Facepile(props: FacepileProps) {
  return createElement(api().Facepile, props)
}
export function PresenceFrame(props: PresenceFrameProps) {
  return createElement(api().PresenceFrame, props)
}
export function PresenceGroup(props: PresenceGroupProps) {
  return createElement(api().PresenceGroup, props)
}
export function PresenceGutter(props: PresenceGutterProps) {
  return createElement(api().PresenceGutter, props)
}
