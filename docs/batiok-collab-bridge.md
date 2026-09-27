# Batiok integration: workspace users and presence

Batiok owns accounts, workspace membership, profiles, and access. moi receives one global current
identity and workspace-specific membership directories through an atomic browser snapshot. Switching
workspaces does not change who the viewer is. Applets read this information through `moi/collab`.

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

type WorkspaceDirectory = { status: 'loading' } | { status: 'ready'; users: readonly UserProfile[] }

type HostState = {
  identity: UserProfile | null
  workspaces: Readonly<Record<string, WorkspaceDirectory>>
}

type CollabHostBridge = {
  getHostState(): HostState | null
  setHostState(state: HostState): void
  subscribeHostState(listener: (state: HostState | null) => void): () => void
  setShareHandler(
    handler: ((context: { workspaceId: string; url: string }) => Promise<{ url: string }>) | null
  ): void
}
```

`setHostState` replaces the complete snapshot. Identity and every supplied directory become visible
together before any subscription runs. The whole input is validated before publishing; an invalid
profile or directory leaves the previous snapshot intact. Getters return stable, copied, frozen data.
Use the setter to publish changes instead of modifying objects returned by the getter.

- `identity` describes the current viewer globally, across all workspaces.
- `status: 'loading'` means Batiok has not supplied the workspace's membership yet.
- `status: 'ready', users: []` means the membership is known and empty. It is not a loading state.
- A workspace omitted from a hosted snapshot is loading. It never falls back to self-reported profiles.
- Ready lists are authoritative. Omitted users resolve as unknown, even if a stale connection reports
  their IDs. If a list includes the viewer, moi uses the global identity's profile for that row. It
  never inserts the viewer into a list which excludes them.
- Setting `identity: null` signs out and clears all supplied directories in the same update. An external
  host stays authoritative; an old development identity cannot reactivate it.
- `getHostState() === null` means no external host has taken ownership. This is the development fallback,
  distinct from a hosted signed-out snapshot with `identity: null`.
- Subscriptions receive the current snapshot immediately and return an unsubscribe function.

Batiok distributes its membership and profile events to each browser using its own transport, then
publishes the complete snapshot in that browser. moi does not fan out directory data through its
presence socket. An offline member's profile can change without that member opening the workspace.

The viewer has one canonical name, avatar, email, and color. If the viewer belongs to two workspaces,
a single identity update changes their own row in both supplied lists. Other members' profiles come
from their respective workspace lists. Membership remains independent: omitting the viewer's ID does
not create membership merely because they have an identity.

Applets can distinguish these states with `useWorkspaceUsersStatus()`, which returns `unavailable`,
`loading`, or `ready`. `useWorkspaceUsers()` returns the member list; a loading empty list must not be
presented as confirmation that the workspace has no members.

## Bootstrap before moi loads

Put a script before moi's modules in the HTML shell. Supply `getHostState` initially, then use the
installed bridge after the `moi:collab-ready` event. Keep the snapshot in a closure so changes arriving
before moi initializes are also available when it loads.

```js
// This state comes from Batiok's authenticated session and workspace API.
// These are example values; no credentials belong in user profiles.
let currentState = {
  identity: {
    id: 'user-alex',
    name: 'Alex',
    color: '#0f766e',
    email: 'alex@example.com'
  },
  workspaces: {
    'workspace-design': { status: 'loading' }
  }
}

window.moi ??= {}
window.moi.collab = { getHostState: () => currentState }

let connectedBridge
function connect() {
  const bridge = window.moi.collab
  if (!bridge.setHostState || connectedBridge === bridge) return
  connectedBridge = bridge
  bridge.setHostState(currentState)
  // Install Batiok's share-link handler here when available.
}
window.addEventListener('moi:collab-ready', connect)
connect()

function publishState(next) {
  // If validation fails after initialization, keep the previous host snapshot too.
  window.moi.collab.setHostState?.(next)
  currentState = next
}

// Batiok calls these from its authenticated session and membership subscriptions.
function workspaceUsersChanged(workspaceId, users) {
  publishState({
    ...currentState,
    workspaces: {
      ...currentState.workspaces,
      [workspaceId]: { status: 'ready', users }
    }
  })
}
function currentUserChanged(user) {
  publishState({
    identity: user,
    workspaces: user && user.id === currentState.identity?.id ? currentState.workspaces : {}
  })
}
function signedOut() {
  publishState({ identity: null, workspaces: {} })
}
```

Repeated ready events do not attach the same integration twice. In a long-lived outer shell, remove
the ready listener and dispose Batiok's subscriptions when that shell unmounts. A failed bootstrap
getter leaves the host authoritative and signed out until it supplies a valid snapshot.

## Runtime updates

When membership loads, replace that workspace's loading entry with a ready list. When a member is
removed, omit their ID from the next ready list. `useUser(id)` becomes `null`, and components use their
unknown-user fallback. Send an explicit ready empty list when a workspace has no members or the viewer
should no longer see its membership. Omitting the entire workspace signals loading, not removal.

When the viewer's profile changes, replace `identity` in the complete snapshot. moi applies that global
profile to the viewer's rows in every supplied directory. When another member changes their profile,
replace the affected ready lists. Include all previously supplied workspace entries which remain valid;
a snapshot is a full replacement, not a patch.

Sign out with `{ identity: null, workspaces: {} }`. For another account, supply its global identity and
its directories together; use loading entries until its memberships arrive. Do not carry the previous
account's directories into the new snapshot. If asynchronous requests finish out of order, Batiok must
discard stale responses before publishing. Setters apply snapshots in call order.

Directory changes describe display data. Batiok must independently enforce server access and revoke
it when appropriate. The identity/profile bridge is not an authentication or authorization mechanism.

## Local and disabled modes

Without an external host, `/dev/collab` can explicitly set a tab-local development identity. The live
room exchanges temporary profiles for current connections; offline lookup requires a host directory
or playground fixture. After an external host claims the bridge, missing directories remain loading
and cannot silently restore the development fallback.

With live presence disabled, supplied identity and directory data remain available. Peers and presence
are empty, publishing does nothing, and no socket opens. Membership readiness is separate from live
connection state: a ready directory does not mean its members are currently connected.

## Batiok work outside this repository

1. Supply the bootstrap snapshot before loading moi.
2. Maintain one global identity and a loading/ready membership entry for each relevant workspace.
3. Publish a complete atomic snapshot for profile, membership, sign-in, and sign-out changes.
4. Discard stale asynchronous results and independently enforce server access.
5. Supply a share handler if Batiok creates invitations or share links.
6. Verify two browser sessions, loading versus empty membership, an offline member, a profile update
   across two workspaces, a removal, and sign-out.

Authentication UI, billing, invitations, and arbitrary workspace-specific user metadata remain Batiok
or workspace application concerns. This bridge introduces no realtime application-data API.
