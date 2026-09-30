# collab: experimental presence

Status: experimental implementation, updated 2026-09-27.

## Scope

collab supplies workspace users, live presence, cursors, focus, and selection to widgets and
views through `moi/collab`. Everyone connects to the same running moi server. A workspace has
one supervised presence subprocess; it keeps connections and presence in memory only.

Persistent shared applet data and realtime query/mutation synchronization are outside this PR.
There is no collaboration database, mutation endpoint, optimistic write queue, or receipt API.
Existing experimental `.moi/data/collab.sqlite` files are left untouched and are no longer opened.

```mermaid
flowchart TB
  Host["Batiok / outer host"] -->|"Current user + workspace users"| Directory["Browser user directory"]
  Applets["Widgets and views: moi/collab"] --> Hooks["Hooks and connected components"]
  Directory --> Hooks
  Hooks --> Engine["CollabEngine: lifecycle + selected snapshots"]
  Engine <-->|WebSocket| Main["moi server: validation and supervision"]
  Main <-->|Typed IPC| Room["One temporary presence room per workspace"]
```

The existing applet bridge passes the host's actual hook and component functions into each
separately compiled bundle. Those functions read the host's workspace and applet React contexts.
React receives one `CollabEngine` per mounted workspace through `CollabProvider`. The engine owns
transport lifecycle and exposes stable user and channel snapshots, so cursor-only traffic does not
rerender profile readers or unrelated channels. Transport and registration storage remain private
implementation details. `AppletScope` supplies only the surface and active mount lifetime. There is
no separate enabled context or backend adapter; the playground supplies the same engine contract.

## Enable and install

The shared startup flag pattern is described in [Experimental features](experimental-features.md).

- `moi start --experimental-collab` enables live presence for this server process.
- `moi start --dev --experimental-collab` enables it under the dev supervisor.
- A server started with `moi start` has live presence disabled.
- `moi init --experimental-collab` separately installs the optional applet guide and types.

Only the `moi start --experimental-collab` flag enables live presence. The launcher forwards it to
its child server, including after development and update restarts.
Startup configuration exposes `experimental.collab` through `/api/config`. The app loads it before
React mounts and refreshes it on workspace-event reconnect. Workers start lazily.

The API remains available with presence disabled: applets still render, user profiles can resolve,
peer/presence lists are empty, and publication is inert. No presence socket is opened. A mounted
applet gets the same context shape in either mode.

If an applet has no host bridge, or its bridge has been disposed, `moi/collab` warns once per
bundle. User lookup returns `undefined`, list hooks return `[]`, publication does nothing, and every
collaboration component renders nothing, including wrapper children. A disabled runtime still
provides a bridge and keeps ordinary applet rendering available.

The current user starts as `null`. Local development uses an explicit test user from `/dev/collab`,
stored in that browser tab's `sessionStorage`. An outer provider owns the current user once injected,
including when it signs out. Applets cannot set the current user. Without one there is no presence connection.

## Cloudflare Access user

A deployment behind Cloudflare Access (Zero Trust) can use each viewer's verified profile instead of
asking for a local test user. It is global deployment config: `cloudflareAccess` in `config.json` in
moi's data directory, or env vars, which win per field. Both fields are required; half a
configuration is ignored with a warning.

```json
{ "cloudflareAccess": { "teamDomain": "acme.cloudflareaccess.com", "audience": "<AUD tag>" } }
```

`MOI_CLOUDFLARE_ACCESS_TEAM_DOMAIN=acme` and `MOI_CLOUDFLARE_ACCESS_AUD=<tag>[,<tag>]` are the env
equivalents. The team domain accepts a bare team name, a host, or its `https://` URL.

The server verifies the `Cf-Access-Jwt-Assertion` token Access adds to each request, or the same
token in the browser's `CF_Authorization` cookie when a proxy drops that header: the RS256
signature against the team's published keys, the issuer, the audience, and expiry, with a minute of
clock drift. Verification uses `jose`, which caches the keys for ten minutes and refetches them for
an unknown key id at most every 30 seconds, so a key Cloudflare stops publishing stops verifying.
Failed key fetches are logged and verify nothing. Service tokens carry no user. The profile takes
`id` from the token's `sub` and `email` from its `email`.
Tokens carry no display name, so the profile has no `name` and built-in labels show the email.
`color` is a stable palette name picked from the id. There is no avatar, so
components draw the usual generated face.

`GET /api/proxy-user` returns `{ provider, profile }` and is never cached. The app loads it before
mounting and again after a reconnect. The verified profile replaces a saved local test user and
locks its setup form. A request without a valid token leaves the tab signed out. The presence socket
upgrade verifies the token too: without it the upgrade fails with 401. With it, `join` and
`profile` messages must carry the verified id, and the server replaces their profile with the
verified one, so a browser cannot appear as someone else. An outer host that injects state still
owns the current user in the browser. If that user's ID differs from the Access token, the socket
is refused. Access supplies no membership, so the workspace directory keeps the live fallback.

## Users and connections

A `UserProfile` is `{ id, color, name?, email?, avatar? }`. Colors use the
[user palette](../lib/collab/colors.ts), with shades defined in [client/index.css](../client/index.css).
Hosts may omit color; moi derives it from the ID. Supplied colors take precedence and may repeat.
Names are trimmed and blank names omitted. Built-in labels fall back to email, then ID.
The outer host enforces authentication and workspace access.

A `Connection` is `{ connectionId, userId, location, presence }`. One user can have multiple browser
tabs. The server assigns connection IDs. `location` is `{ page, away? } | null`. Hidden
tabs retain their page with `away: true`; `null` means the connection has no known page. A page is
the route segment within the workspace. Status is aggregated across a user's workspace connections.
Hooks return a `WorkspaceUser`, which adds this status to the profile:

- `active`: at least one connection with a known page and `away` absent or false.
- `away`: connected, but no visible connection with a known page.
- `offline`: no connection in this workspace.

Being on a different page does not make someone offline. `usePeers()` defaults to the current
page, deduplicates by user ID, and excludes the current user across all their connections.
Hidden peers remain on their page, so `usePeers({ status: 'away' })` works with the default
page scope. `scope: 'workspace'` includes other pages too. Status reflects tab visibility, not idle time
or window focus. Hidden connections have no visible cursor/focus/selection markers.
Presence values remain per connection and exclude only the observing connection, so another tab
of the same user can still have its own pointer.

Batiok atomically publishes `{ currentUser, workspaces }` through `window.moi.collab.setHostState`.
The current user is global across all workspaces; each directory has an explicit `loading` or `ready` state.
The current user profile replaces its own row in every ready directory which includes that ID,
without adding missing membership. Sign-out clears all directories in the same update.

Batiok's full workspace directory is authoritative when supplied. It allows resolving an offline
user, including someone who has never opened the workspace. Profile replacement and removal take
effect immediately; live connections cannot resurrect removed directory entries. With no host
directory, current connection profiles and the local test user provide a development fallback.
This fallback is transient and makes no promise of resolving users after they leave.

`useMe()` resolves the current user through the current workspace membership. It returns `undefined`
while membership loads or when a ready directory omits the viewer. `useWorkspaceUsersAvailability()`
distinguishes loading from a ready empty directory; readiness does not imply a live connection.

The Batiok bootstrap example and update steps are in
[batiok-collab-bridge.md](batiok-collab-bridge.md).

## Applet API

| Hook                                 | Contract                                                                                                        |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `useMe()`                            | Current user profile plus `status`, or `undefined`.                                                             |
| `useUser(id)`                        | A profile plus `status`, including offline users; `undefined` for unknown IDs.                                  |
| `useWorkspaceUsersAvailability()`    | Directory availability: `unavailable` (live/dev fallback), `loading`, or `ready` (possibly empty).              |
| `useWorkspaceUsers({ status? })`     | Complete workspace directory, including self and offline users; optional `active`, `away`, or `offline` filter. |
| `usePeers({ scope?, status? })`      | Other connected users; `scope` is `page` or `workspace`, `status` is `active` or `away`.                        |
| `usePresence(channel)`               | Read-only array of `{ connectionId, userId, value }` for other connections on this page and applet surface.     |
| `usePublishPresence(channel, value)` | Publish the current JSON value reactively while mounted and visible. Returns nothing.                           |

Reading presence never creates a presence registration. Publication owns one registration per
mounted hook and replaces that registration's whole value. Hidden views, browser tabs, outgoing
builds, unmounts, and Strict Mode cleanup release registrations. Presence is restored after reconnect.
Custom channel names are scoped by applet surface (`view:<name>` or `widget:<name>`); they are not
a persistent key/value store. Channel values must be JSON and fit within 4 KiB.

| Component        | Contract                                                                                |
| ---------------- | --------------------------------------------------------------------------------------- |
| `User`           | Resolve a profile by `id`; name/avatar, sizes, optional status and detail.              |
| `Facepile`       | Resolve `ids` and render stacked avatars with an overflow count.                        |
| `Activity`       | Show the current user and other connected users on the page or in the workspace.        |
| `Cursors`        | Wrap a cursor surface; optional stable `surface` name.                                  |
| `PresenceFrame`  | Wrap one element with a stable local `id`; outline it when another user focuses inside. |
| `PresenceGutter` | The same single-element focus contract, with avatars beside it.                         |
| `PresenceGroup`  | Require `id`, namespace descendant targets, and constrain gutter avatar animations.     |
| `Selection`      | Supply a local `id` and controlled `selected` boolean within the same group namespace.  |

Frame and gutter discover focus through presence and share the same target channel. Each accepts
exactly one React element, including a label or composed component with nested controls; fragments,
arrays, text, and absent children are rejected. Nested focus belongs to the nearest target wrapper.
Their `id` identifies the target, not a user or an HTML element. `each` and `target` props are removed;
lists explicitly render one wrapper per item with both a React `key` and a presence `id`.

`PresenceGroup id` composes a namespace with its enclosing groups. A field `id="title"` inside
groups `id="tasks"` and `id="42"` resolves to `tasks/42/title`. Each segment is URI-encoded before
joining, so an ID containing `/` or `%` cannot collide with a different nesting structure. IDs must
be nonblank and stable across browsers, and targets should be unique within their group. Reordering
keeps presence attached to its data; removing a target or changing its ID/group clears the old
registration. Reusing a modal for another record must change its group ID or local target ID.

Groups add no DOM or presence publication; ordinary elements own layout. Each group also has a
separate local animation identity so avatars do not glide between unrelated rendered groups which
happen to share semantic IDs. Page and applet isolation remain outside this namespace. Group IDs
scope frame, gutter, and selection targets; custom presence channels and cursor surface names keep
their existing applet scope. Built-in target wrappers also provide the resolved cursor anchor.

`useWorkspaceUsers` enumerates the full host directory, while `usePeers` enumerates connections
deduplicated by user. The workspace header shows connected users (active or away) only; its user
popover can list offline users too. Without a host directory, enumeration falls back to the local
current user and currently connected profiles, so it cannot discover offline users.

`Cursors` is the public cursor component; the singular cursor renderer is internal. Pointer updates
are coalesced to 50 ms. Optional `data-collab-target` anchors allow pointers to follow an element
when layouts or scroll positions differ; arbitrary canvas coordinate mapping is not implemented.

Public declarations: [collab.d.ts](../server/applets/declarations/collab.d.ts).
Authoring guide: [COLLAB.md](../workspace/.claude/skills/moi-workspace/references/COLLAB.md).

## Transport and lifecycle

Protocol version 1 accepts a `join` with a user profile, profile updates, location updates,
presence registration updates/removals, and ping. It sends welcome, connection/profile snapshots,
errors, and pong.
Profiles in socket snapshots are only a fallback for current connections; the full host directory
is never sent through this socket.

The main server owns sockets, validates messages, enforces payload limits, and supervises one
subprocess per canonical workspace path. The process owns connections and temporary registrations.
No persistent storage is opened. Each workspace supports up to 64 browser connections, and each
connection supports up to 128 active presence registrations, with a 4 KiB value limit per registration.
Unfocused controls do not consume registrations. Limits count browser connections and active
publishers, not directory users.
Slow sockets are disconnected when reliable delivery cannot be maintained, including when a connection
snapshot cannot be delivered. Reconnect repairs the full snapshot so a dropped final departure cannot
leave ghost presence alive behind healthy heartbeats.

Worker failure closes its sockets. Clients reconnect with backoff, join afresh, and republish live
presence. Shutdown and parent IPC loss terminate children. Applet rebuilds and function-worker
restarts do not restart presence. Idle workers can exit; active rooms are preserved.

With runtime and a current user, selected chats and open/current tabs are browser-tab-local.
Chat requests mark their selected session scope as `browser-tab`; otherwise the scope is `shared`.
Local applet navigation and main's targeted navigation relay update the selected browser. Browser
tab selections do not update the shared tab or chat selection. They do not switch other tabs.
Ordinary navigation remains when no current user is supplied. Share invokes the outer host's
handler, or copies the workspace URL if none exists; copying does not grant access or publish a
workspace.

## Development and verification

`/dev/collab` combines local test user setup with an isolated presence playground. The
playground works without enabling runtime, opening a workspace, or setting up a test user. It uses
the same hooks, components, and selected snapshots with a fake engine and fixture directory. Reopening
it resets its state; other browser tabs have independent fake rooms.

Use real workspace applets in two browsers to verify transport: joins/leaves, duplicate user tabs,
profile updates/removals, read-only presence, focus/selection/cursors, hidden tabs, view switches,
rebuild cleanup, reconnection, and workspace isolation. Disabled-mode applets must render without
opening a socket. Unit/integration tests cover directory ownership, protocol validation, room
cleanup, process supervision, store recovery, and public declarations.

A later realtime-data proposal may build on server functions and query invalidation. No part of
that design is implemented or exposed by this PR.
