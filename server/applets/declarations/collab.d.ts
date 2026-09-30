// Optional collab applet types installed as `.moi/collab.d.ts` by moi.
declare module 'moi/collab' {
  import type { ReactElement, ReactNode } from 'react'

  export type CollabJsonValue =
    | null
    | boolean
    | number
    | string
    | CollabJsonValue[]
    | { [key: string]: CollabJsonValue }

  export type UserColor =
    | 'pink'
    | 'orange'
    | 'amber'
    | 'lime'
    | 'emerald'
    | 'cyan'
    | 'blue'
    | 'violet'
  export type UserProfile = {
    id: string
    color: UserColor
    name?: string
    email?: string
    avatar?: string
  }
  export type UserStatus = 'active' | 'away' | 'offline'
  export type WorkspaceUser = UserProfile & { status: UserStatus }
  export type UsePeersOptions = { scope?: 'page' | 'workspace'; status?: 'active' | 'away' }
  export type UseWorkspaceUsersOptions = { status?: UserStatus }

  // Peers are connected users, deduplicated across tabs, excluding your own user.
  export function useMe(): WorkspaceUser | null
  export function useUser(id: string): WorkspaceUser | null
  export function usePeers(options?: UsePeersOptions): WorkspaceUser[]
  // Full workspace directory, including your own user and offline users.
  export function useWorkspaceUsers(options?: UseWorkspaceUsersOptions): WorkspaceUser[]
  // Unavailable uses live/dev profiles; loading differs from a ready empty directory.
  export type WorkspaceUsersAvailability = 'unavailable' | 'loading' | 'ready'
  export function useWorkspaceUsersAvailability(): WorkspaceUsersAvailability

  export type PresenceValue<T> = { connectionId: string; userId: string; value: T }
  // Reading never registers or publishes presence. Values belong to connections.
  export function usePresence<T extends CollabJsonValue>(channel: string): PresenceValue<T>[]
  // Publishes the current value reactively, releasing it on hide or unmount.
  export function usePublishPresence<T extends CollabJsonValue>(channel: string, value: T): void

  export type ActivityProps = { scope?: 'page' | 'workspace'; className?: string }
  export function Activity(props: ActivityProps): ReactElement
  export type CursorsProps = { surface?: string; children: ReactNode; className?: string }
  export function Cursors(props: CursorsProps): ReactElement

  // Stable local IDs compose with enclosing PresenceGroup IDs across browsers.
  // Each focus wrapper accepts one element (not a fragment) and tracks its descendants.
  export type PresenceFrameProps = {
    id: string
    children: ReactElement
    className?: string
  }
  export function PresenceFrame(props: PresenceFrameProps): ReactElement
  export type PresenceGutterProps = {
    id: string
    children: ReactElement
    className?: string
  }
  export function PresenceGutter(props: PresenceGutterProps): ReactElement
  // Adds a namespace and a local gutter animation group; no DOM or publication.
  export type PresenceGroupProps = { id: string; children: ReactNode }
  export function PresenceGroup(props: PresenceGroupProps): ReactElement
  export type SelectionProps = {
    id: string
    selected: boolean
    children: ReactNode
    className?: string
  }
  export function Selection(props: SelectionProps): ReactElement

  export type UserSize = 'xs' | 'sm' | 'md' | 'lg'
  export type UserProps = {
    id: string
    size?: UserSize
    avatarOnly?: boolean
    you?: boolean
    detail?: ReactNode
    showStatus?: boolean
    label?: string
    className?: string
  }
  export function User(props: UserProps): ReactElement
  export type FacepileProps = {
    ids: readonly string[]
    max?: number
    size?: 'xs' | 'sm' | 'md'
    showStatus?: boolean
    className?: string
  }
  export function Facepile(props: FacepileProps): ReactElement
}
