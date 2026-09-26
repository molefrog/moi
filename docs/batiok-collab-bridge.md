# Batiok integration: workspace users and presence

This is the implemented boundary between an outer host such as Batiok and moi's presence feature.
Batiok owns accounts, workspace membership, profiles, and access. moi consumes a current identity
and a complete, replaceable user directory for each workspace. Applets read that information through
`moi/collab`; they never register themselves as a different user.

## Browser contract

The bridge is `window.moi.collab`. Its implementation and exported TypeScript contract live in
[identity.ts](../client/features/collab/identity.ts).

```ts
type UserProfile = {
  id: string
  name: string
  color: string
  avatar?: string
  email?: string
}

type CollabHostBridge = {
  getIdentity(): UserProfile | null
  setIdentity(user: UserProfile | null): void
  subscribeIdentity(listener: (user: UserProfile | null) => void): () => void
  getWorkspaceUsers(workspaceId: string): readonly UserProfile[] | null
  setWorkspaceUsers(workspaceId: string, users: readonly UserProfile[] | null): void
  subscribeWorkspaceUsers(
    workspaceId: string,
    listener: (users: readonly UserProfile[] | null) => void
  ): () => void
  setShareHandler(
    handler: ((context: { workspaceId: string; url: string }) => Promise<{ url: string }>) | null
  ): void
}
```

`setWorkspaceUsers` replaces the entire snapshot atomically. This makes removals unambiguous and
is sufficient for the small workspace membership lists targeted here. No incremental patch protocol,
revision stream, profile database, or synchronization service is introduced into moi.

- An array, including `[]`, claims authority for that workspace. Unknown IDs resolve to `null`;
  stale self-reported profiles from a connected tab never override it.
- `null` means no host directory is supplied and releases the override. Development can then use
  currently connected profiles. **Use `[]`, not `null`, to clear access to a previous directory.**
- Profiles are validated and copied; the caller must use the setter to publish later changes.
  Invalid snapshots fail without partially applying their contents.
- Each workspace has its own snapshot and subscriptions. Updating one does not update another.
- Subscriptions receive the current snapshot immediately and return an unsubscribe function.
- These setters update this browser. Batiok distributes its membership/profile events to each
  browser using its own transport, then calls the setters there. moi does not fan out the directory.

A profile's `status` is not supplied by Batiok. moi derives it from live connections when returning
`useMe`, `useUser`, `useWorkspaceUsers`, or `usePeers`. Applets can enumerate the complete directory
with `useWorkspaceUsers()` and optionally filter by `active`, `away`, or `offline`. `usePeers()`
continues to list connected users only. Profile data is independent of presence: an offline member's name
can change without that person opening the workspace.

## Bootstrap before moi loads

Put a script before moi's modules in the HTML shell. It can supply initial getters without waiting
for the bridge to be installed. The directory getter is also consulted when another workspace is
first visited, so it must be able to resolve each relevant workspace ID.

```js
// This state comes from Batiok's authenticated session and workspace API.
// These are example values; no credentials belong in user profiles.
let currentUser = {
  id: 'user-alex',
  name: 'Alex',
  color: '#0f766e',
  email: 'alex@example.com'
}
const directories = new Map([
  ['workspace-design', [currentUser, { id: 'user-anton', name: 'Anton', color: '#2563eb' }]]
])

window.moi ??= {}
const bootstrap = {
  getIdentity: () => currentUser,
  // Empty until loaded: Batiok still owns the directory during loading.
  getWorkspaceUsers: id => directories.get(id) ?? []
}
window.moi.collab = bootstrap

let connectedBridge
function connect() {
  const bridge = window.moi.collab
  if (!bridge.setWorkspaceUsers || connectedBridge === bridge) return
  connectedBridge = bridge
  bridge.setIdentity(currentUser)
  for (const [id, users] of directories) bridge.setWorkspaceUsers(id, users)
  // Install Batiok's share-link handler here when available.
}
window.addEventListener('moi:collab-ready', connect)
connect()

// Call these from Batiok's existing profile/membership subscription.
function workspaceUsersChanged(workspaceId, users) {
  directories.set(workspaceId, users)
  window.moi.collab.setWorkspaceUsers?.(workspaceId, users)
}
function currentUserChanged(user) {
  currentUser = user
  window.moi.collab.setIdentity?.(user)
}
```

The closure-backed getters also cover updates that arrive before moi initializes. Repeated ready
events do not attach the same integration twice. In a long-lived outer shell, remove the listener
and dispose Batiok's subscriptions when that shell unmounts.

## Runtime updates

When a member changes their avatar or name, Batiok sends the latest full workspace list to each
viewer and calls `setWorkspaceUsers(workspaceId, users)`. `User`, `Facepile`, focus markers, cursors,
and user hooks immediately resolve against the new profile. If that member is the current viewer,
also call `setIdentity(updatedUser)` so their local identity stays current.

When a member is removed, omit their ID from the next snapshot. `useUser(id)` becomes `null` even
if a stale connection still reports that ID. Components show their unknown-user fallback. This
changes display data; Batiok must independently revoke server access when appropriate.

On sign-out, call `setIdentity(null)` and clear previously supplied workspace lists with `[]`.
An external provider remains authoritative while signed out; an old dev profile cannot reactivate
it. On sign-in, provide the new viewer and that viewer's workspace directories. If host fetches can
finish out of order, Batiok must discard stale responses before publishing snapshots; setters apply
snapshots in call order.

## Local and disabled modes

With no external provider, `/dev/collab` can explicitly set a tab-local test identity. The live room
exchanges temporary profiles for current connections. It does not remember users after disconnect;
full offline lookup requires a directory supplied by the host or a playground fixture.

With live presence disabled, user lookup can still resolve supplied profiles, but peers and presence
are empty and publishing does nothing. No socket is opened. This lets the same applet run in local
single-user and hosted multiplayer settings.

## Batiok work outside this repository

1. Supply the bootstrap getters before loading moi.
2. Connect the authenticated current-user and workspace-membership subscriptions to these setters.
3. Deliver full replacement snapshots on changes and clear them on sign-out/access changes.
4. Supply a share handler if Batiok creates invitations or share links.
5. Verify two different browser sessions, an offline member, a profile update, a removal, and sign-out.

Authentication UI, billing, invitations, and arbitrary workspace-specific user metadata remain
Batiok or workspace application concerns. This bridge introduces no realtime application-data API.
