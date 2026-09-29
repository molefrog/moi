# Batiok integration: workspace users and presence

Batiok supplies the current user and workspace user directories to moi through
`window.moi.collab`. Batiok also owns authentication, workspace access, and delivery of profile and
membership changes to each browser. The bridge's types and validation rules live in
[host-state.ts](../client/features/collab/host-state.ts); the applet behavior is described in the
[collab RFC](rfc-collab.md).

## Bootstrap

Put this script before moi's modules in Batiok's HTML shell. `getHostState` lets moi read the latest
snapshot when its bridge starts, including changes that arrived during loading.

```js
// Fill this from Batiok's authenticated session and workspace API.
let state = {
  currentUser: { id: 'user-alex', name: 'Alex' },
  workspaces: {
    'workspace-design': { status: 'loading' }
  }
}

window.moi ??= {}
window.moi.collab = { getHostState: () => state }

function publishState(next) {
  // Once moi has installed its bridge, validate and publish before saving the snapshot.
  window.moi.collab.setHostState?.(next)
  state = next
}
```

When moi initializes, it replaces the bootstrap object with its bridge and reads the snapshot from
`getHostState`. After that, `publishState` calls `setHostState`. An invalid snapshot throws and leaves
the previous one in place. The bridge dispatches `moi:collab-ready` when it is installed; Batiok can
use that event to register an optional `setShareHandler` for invitation links.

## Publish changes

`publishState` replaces the **whole** snapshot. Keep unchanged workspace entries when one directory
changes:

```js
function workspaceUsersChanged(workspaceId, users) {
  publishState({
    ...state,
    workspaces: {
      ...state.workspaces,
      [workspaceId]: { status: 'ready', users }
    }
  })
}
```

Each user needs an `id`. Name, email, avatar, and color are optional. A supplied color must be one of
`pink`, `orange`, `amber`, `lime`, `emerald`, `cyan`, `blue`, or `violet`; moi picks a stable name from
the ID when it is omitted. `currentUser` is global. To update that user's profile, replace
`currentUser` in the snapshot. For another user, update each ready workspace list that contains them.

Use `{ status: 'loading' }` until a workspace directory arrives. Use
`{ status: 'ready', users: [] }` when it is known to be empty. Omitting a workspace also means
loading. A ready list determines membership and lets applets resolve offline users; a live connection
does not add someone missing from that list.

On account switch, publish the new `currentUser` with only that account's directories, using loading
entries until they arrive. On sign-out, publish `{ currentUser: null, workspaces: {} }`. Discard stale
asynchronous responses before publishing either change. Batiok must enforce access separately from
this display-data bridge.

The current user and directories remain available when live presence is disabled. A ready directory
does not imply its users are connected. Verify loading and empty directories, an offline user, profile
updates, removal, account switching, and sign-out in the Batiok integration.
