// Public collab contract, reused internally and installed as `.moi/collab.d.ts`.
declare module 'moi/collab' {
  import type { ReactElement, ReactNode } from 'react'
  import type { JsonValue } from 'moi'

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
  export type ConnectionStatus = 'active' | 'away'
  export type UserStatus = ConnectionStatus | 'offline'
  export type WorkspaceUser = UserProfile & { status: UserStatus }
  export type UsePeersOptions = { scope?: 'page' | 'workspace'; status?: ConnectionStatus }
  export type UseWorkspaceUsersOptions = { status?: UserStatus }

  // Peers are connected users, deduplicated across tabs, excluding your own user.
  export function useMe(): WorkspaceUser | undefined
  export function useUser(id: string): WorkspaceUser | undefined
  export function usePeers(options?: UsePeersOptions): WorkspaceUser[]
  // Full workspace directory, including your own user and offline users.
  export function useWorkspaceUsers(options?: UseWorkspaceUsersOptions): WorkspaceUser[]

  export type PresenceValue<T> = { connectionId: string; userId: string; value: T }
  // Reading never registers or publishes presence. Values belong to connections.
  export function usePresence<T extends JsonValue>(channel: string): PresenceValue<T>[]
  // Publishes the current value reactively, releasing it on hide or unmount.
  export function usePublishPresence<T extends JsonValue>(channel: string, value: T): void

  // Identifies a cursor area within the applet; defaults to 'default'.
  export type CursorsProps = { id?: string; children: ReactNode; className?: string }
  export function Cursors(props: CursorsProps): ReactElement

  // Stable local IDs compose with enclosing PresenceGroup IDs across browsers.
  // Without present, each wrapper tracks focus anywhere inside its children.
  // With present, publication is controlled; false clears your presence, not peers.
  export type PresenceFrameProps = {
    id: string
    present?: boolean
    // Name badge alignment above the frame. Defaults to 'end'.
    align?: 'start' | 'end'
    children: ReactNode
    className?: string
  }
  export function PresenceFrame(props: PresenceFrameProps): ReactElement
  export type PresenceAvatarsProps = Omit<PresenceFrameProps, 'align'> & {
    // Vertical alignment in the left gutter. Defaults to 'center'.
    align?: 'start' | 'center' | 'end'
  }
  export function PresenceAvatars(props: PresenceAvatarsProps): ReactElement
  // Adds a namespace and a local gutter animation group; no DOM or publication.
  export type PresenceGroupProps = { id: string; children: ReactNode }
  export function PresenceGroup(props: PresenceGroupProps): ReactElement
  export type UserAvatarProps = {
    id: string
    size?: 'xs' | 'sm' | 'default' | 'lg'
    // Show a status dot when active. Defaults to false.
    showStatusBadge?: boolean
    className?: string
  }
  export function UserAvatar(props: UserAvatarProps): ReactElement
  export type UserProps = Pick<UserAvatarProps, 'id' | 'showStatusBadge' | 'className'> & {
    size?: 'xs' | 'sm' | 'default'
    // Show a "(You)" label beside the current user's name. Defaults to false.
    showYouLabel?: boolean
    // Secondary text alongside or below the name.
    description?: ReactNode
  }
  export function User(props: UserProps): ReactElement
  export type UserAvatarGroupProps = {
    ids: readonly string[]
    max?: number
    size?: UserAvatarProps['size']
    className?: string
  }
  export function UserAvatarGroup(props: UserAvatarGroupProps): ReactElement
}
