# Moi and the cloud

Moi runs your workspace: its files, views, chat, and live presence. The cloud handles sign-in, accounts, and who can access a workspace.

The workspace itself lives on its machine. The cloud keeps the access information.

## What the cloud tells Moi

There are two separate pieces of information:

- **Me:** the current person's ID, name, avatar, and email.
- **Workspace members:** the people who belong to each workspace, plus invitations waiting to be accepted.

The owner appears in the member list too. An invitation becomes a membership only after it is accepted.

The same profile format can describe a person or an agent. Agent sign-in is a later step; the current integration supports people.

## How Moi receives it

When a Moi page opens, the cloud includes the current identity and all stored workspace memberships and pending invitations. It calls Moi's frontend API before React mounts. The cloud does not ask the machine which workspaces exist; Moi matches the supplied IDs to its own workspaces. Entries for workspaces that no longer exist are harmless.

A workspace with no sharing record belongs only to the machine's owner. Each update replaces the stored sharing collection. There is no organization-wide or app-wide people list. A missing member list never falls back to another workspace or to profiles received through a socket.

The cloud also keeps a WebSocket connection open. When a name, avatar, invitation, or membership changes, Moi receives fresh information. Other open tabs update too.

## The main URLs

Cloud URLs use the same host as Moi. For example, on Moi Run they start with `https://run.moi.computer`.

| Purpose                               | URL                                                                   |
| ------------------------------------- | --------------------------------------------------------------------- |
| Open a workspace                      | `/workspace/:workspaceId`                                             |
| Sign in                               | `/cloud/login`                                                        |
| Read identity and all sharing records | `GET /cloud/api/bootstrap`                                            |
| Read who I am                         | `GET /cloud/api/identity`                                             |
| Update my name or avatar              | `POST /cloud/api/auth/profile`                                        |
| Upload or replace my avatar           | `PUT /cloud/api/me/avatar`                                            |
| Remove my avatar                      | `DELETE /cloud/api/me/avatar`                                         |
| Read members and pending invitations  | `GET /cloud/api/workspaces/:workspaceId/members`                      |
| Invite someone                        | `POST /cloud/api/workspaces/:workspaceId/invitations`                 |
| Revoke an invitation                  | `DELETE /cloud/api/workspaces/:workspaceId/invitations/:invitationId` |
| Remove a member                       | `DELETE /cloud/api/workspaces/:workspaceId/members/:membershipId`     |
| Receive live updates                  | `/cloud/api/events` — WebSocket                                       |

An invitation link opens `/cloud/invite/:invitationId`. The cloud handles sign-in and acceptance from there.

Both avatar endpoints return the full updated profile. Uploads use `multipart/form-data` with a `file` field. For now this is a test implementation: it discards the file and assigns an avatar URL from an existing hosted service. Add `provider` with `pravatar`, `dicebear`, `robohash`, `uiavatars`, or `gravatar` to choose; omit it for Pravatar. Random seeds contain no user information and uploaded bytes are never sent to the provider. Any file type is accepted, up to a 5 MB total request. There is no R2 storage. Deleting clears the avatar field; there is no stored image file to delete. These endpoints currently require a signed-in human account.

## Frontend storage and API

Moi keeps two separate things in the browser:

- **Identity store:** who is using this tab.
- **Workspace members cache:** members and pending invitations for each workspace, managed by React Query.

Both live in memory. They are not saved to localStorage, SQLite, or workspace files. The cloud supplies fresh data after a reload.

### Methods the cloud calls

Moi makes these methods available before the app appears:

```js
window.moi.identity.set(me)
window.moi.identity.set(null) // Signed out

window.moi.workspaceMembers.setAll([{ id: workspaceId, members, invitations }])
window.moi.workspaceMembers.set(workspaceId, { members, invitations })
window.moi.workspaceMembers.remove(workspaceId)
window.moi.workspaceMembers.clear()
```

The page starts in this order:

1. The Moi entry chunk installs `window.moi`.
2. The cloud's short inline module calls `identity.set()` and `workspaceMembers.setAll()` with the initial data.
3. Moi's existing `#moi-start` script loads React and mounts the app.

The cloud inserts its module just before `#moi-start`. It also loads `/cloud/bridge.js` for later updates; that download does not hold up rendering. There is no temporary global payload or readiness polling. If either setter is unavailable, initialization does nothing.

`setAll()` replaces the full sharing collection. Workspaces omitted from it have no invited members; the machine owner still has access. `set()` replaces the complete member list for one workspace. `remove()` forgets one workspace's list; `clear()` forgets all of them. These methods update what the frontend knows; they do not change access on the server.

People and agents use the same basic profile: ID, type, name, and avatar. People can also have an email. Invited members have a separate `membershipId`, used when removing their access. The owner has no membership record.

Revision helpers, `identity.getRevision()` and `workspaceMembers.getRevision(workspaceId?)`, help the cloud avoid replacing new data with an old response.

### What frontend components use

Components read the data through hooks:

```tsx
const me = useIdentity()
const { members, invitations, isPending } = useWorkspaceMembers(workspaceId)
```

They use mutation hooks for actions:

```tsx
const invite = useInviteMember(workspaceId)
invite.mutate({ email: 'tony@example.com' })

const remove = useRemoveMember(workspaceId)
remove.mutate({ membershipId })

const revoke = useRevokeInvitation(workspaceId)
revoke.mutate({ invitationId })
```

These hooks call the cloud URLs above. Moi shows pending changes immediately and undoes them if the request fails. Confirmed cloud updates go into the same cache. Switching accounts clears the previous account's data. The cloud checks permission for every action.

### Collaboration

The collaboration engine combines this workspace's members with live connections. Members supply names and avatars; connections supply online status, the current page, and cursor or focus activity. A connection cannot add someone to the member list. `useMe()` reads the current identity; `useWorkspaceUsers()` and `usePeers()` are scoped to the active workspace.

Cloud collaboration waits until the current identity appears in the workspace's members. Removing that member clears their visible presence and closes this tab's connection. The cloud authenticates access to the owner's machine. Signed identity forwarding to Moi is deferred; frontend membership data is not an access token.

Collaboration is off by default. An experimental image can enable it with `collab: true` in the machine configuration or `MOI_COLLAB=1`. Local Moi keeps its local profile; it does not invent a cloud member list. Being a member and being online remain different things.

The code lives in [identity](../client/features/identity/store.ts), [the frontend API](../client/features/identity/host-api.ts), and [workspace member hooks](../client/features/workspace-members/hooks.ts). The sharing page at `/dev/cloud` is a small working example available in development builds, alongside the other dev routes. Production builds exclude it.
