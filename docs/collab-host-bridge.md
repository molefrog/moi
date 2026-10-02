# collab host bridge

An outer host supplies the current user and workspace user directories to moi through
`window.moi.collab`. It owns authentication, workspace access, and delivery of profile and
membership changes to each browser. The bridge's types and validation rules live in
[host-state.ts](../client/features/collab/host-state.ts). See the [applet guide](../workspace/.claude/skills/moi-workspace/references/COLLAB.md)
for user hooks and presence, and the [collab RFC](rfc-collab.md) for runtime details.

## Bootstrap

Put this script before moi's modules in the outer host's HTML shell:

```js
// Fill this from the outer host's authenticated session and workspace API.
let state = {
  currentUser: { id: 'user-alex', name: 'Alex' },
  workspaces: {
    'workspace-design': { status: 'loading' }
  }
}

window.moi ??= {}
window.moi.collab = { getHostState: () => state }

function publishState(next) {
  // Validation may throw; keep the previous state in that case.
  window.moi.collab.setHostState?.(next)
  state = next
}
```

moi reads `getHostState` during initialization, then installs its bridge and dispatches
`moi:collab-ready`. The host can publish subsequent state changes through `setHostState`.

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

Each user needs an `id`. Name, email, avatar, and color are optional. Supplied colors use the
[`UserColor` palette](../server/applets/declarations/collab.d.ts); moi picks a stable color from
the ID when omitted. `currentUser` is global. To update that user's profile, replace
`currentUser` in the snapshot. For another user, update each ready workspace list that contains them.

Use `{ status: 'loading' }` until a workspace directory arrives. Use
`{ status: 'ready', users: [] }` when it is known to be empty. Omitting a workspace also means
loading. A ready list determines membership and lets applets resolve offline users; a live connection
does not add someone missing from that list.

On account switch, publish the new `currentUser` with only that account's directories, using loading
entries until they arrive. On sign-out, publish `{ workspaces: {} }`. Discard stale
asynchronous responses before publishing either change. The outer host must enforce access separately from
this display-data bridge.

Directories remain available when live presence is disabled. A ready directory does not imply
its users are connected.
