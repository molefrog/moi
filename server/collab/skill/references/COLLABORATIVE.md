# Collaborative applets

`moi/collab` provides user lookup and temporary presence for workspace views and widgets. Live
presence requires `moi start --experimental-collab` and an identity supplied by the host or explicitly
through `/dev/collab`. Installing this guide does not enable the runtime.

The host provides the connection, store, React context, and user directory. Import the hooks and
components directly; do not open another socket, create a provider, invent user identities, or
install a collaboration package. These are ordinary imports handled by moi's applet bundler.

This API does not persist application data or synchronize todo lists, documents, or other content.
Keep existing `.server.ts` functions and storage for application data. Presence values disappear
when their publisher leaves. Do not use them as a database, lock, or source of access permissions.

## Users

```tsx
import { useMe, useUser, usePeers, useWorkspaceUsers, User, Facepile, Activity } from 'moi/collab'

const me = useMe()
const author = useUser(authorId)
const peers = usePeers() // Other connected users on this page
const workspacePeers = usePeers({ scope: 'workspace' })
const members = useWorkspaceUsers() // Includes you and offline members
const offlineMembers = useWorkspaceUsers({ status: 'offline' })
```

A resolved user is `{ id, name, color, avatar?, email?, status }`. `useMe()` and `useUser(id)` return
`null` if unavailable. Status is `active` (at least one visible workspace connection), `away` (all
connections hidden), or `offline` (none). A user on another page is not offline.

`usePeers` returns connected users once each, excluding your own user across all your tabs.
Its options are `{ scope?: 'page' | 'workspace', status?: 'active' | 'away' }`. It never lists offline
members. `useUser` can resolve an offline member from the host's directory, even one who has never
opened the workspace. Unknown or removed IDs return `null`.

`useWorkspaceUsers({ status? })` returns the complete supplied workspace directory, including you
and offline members. Filter by `active`, `away`, or `offline`, or omit options for everyone. Use it
for assignee pickers and member lists. Without a host directory, only the local identity and current
connection profiles are available; this fallback cannot discover offline members.

Store user IDs in your application data and resolve current profiles at display time. Batiok or
another outer host owns profiles; applets only read them. Workspace-specific metadata belongs in
your existing application data, keyed by user ID.

```tsx
<User id={authorId} />
<User id={authorId} avatarOnly size="sm" />
<Facepile ids={assigneeIds} max={3} />
<Activity scope="workspace" />
```

`User` accepts `id`, optional `size` (`xs`, `sm`, `md`, `lg`), `avatarOnly`, `you`, `detail`,
`showStatus`, `label`, and `className`. `Facepile` accepts `ids`, `max`, `size` (`xs`, `sm`, `md`),
`showStatus`, and `className`. Unknown IDs render a fallback. `Activity` derives its users from
presence and accepts optional `scope` and `className`.

## Read and publish separately

```tsx
import { usePresence, usePublishPresence, User } from 'moi/collab'

type EditingProps = { itemId: string | null }
function Editing({ itemId }: EditingProps) {
  // Reactively publishes the current value; removes it on hide or unmount.
  usePublishPresence('editing', { itemId })
  return null
}

function OtherEditors() {
  // This component only observes. It does not publish anything.
  const editors = usePresence<{ itemId: string | null }>('editing')
  return editors.map(({ connectionId, userId, value }) =>
    value.itemId ? <User key={connectionId} id={userId} detail={value.itemId} /> : null
  )
}
```

`usePresence<T>(channel)` returns `{ connectionId, userId, value: T }[]`. Entries belong to other
connections on the current page and applet surface, so a second tab of your own user can have a
separate value. It does not publish or require a matching publisher in this component.

`usePublishPresence(channel, value)` returns nothing. Pass your current value; changes replace that
registration's whole value. Each mounted hook owns its registration. Values must be JSON and at
most 4 KiB. Channel names are scoped to the applet (`view:<name>` or `widget:<name>`).

Presence is cleaned up when the applet is inactive, hidden, rebuilt, or unmounted. A hidden browser
tab releases its registrations too. Live values are republished after reconnection. Avoid building
persistent state, write acknowledgment, or transaction logic around these ephemeral values.

## Connected components

```tsx
import { Cursors, PresenceFrame, PresenceGutter, PresenceGroup, Selection } from 'moi/collab'
;<Cursors surface="tasks" className="space-y-4">
  <PresenceFrame target={`todo:${task.id}:title`}>
    <Input value={title} onChange={event => setTitle(event.target.value)} />
  </PresenceFrame>

  <PresenceGutter target="tasks" each className="space-y-4">
    {tasks.map(task => (
      <Input
        key={task.id}
        value={task.title}
        onChange={event => updateDraft(task.id, event.target.value)}
      />
    ))}
  </PresenceGutter>

  <Selection target={`todo:${task.id}`} selected={selected}>
    <Button onClick={() => setSelected(value => !value)}>Select task</Button>
  </Selection>
</Cursors>
```

Use your workspace's existing Input/Button components. The example's values and editing handlers
are ordinary application state; the wrappers add presence only.

- `PresenceFrame` and `PresenceGutter` both take a required stable `target`, `children`, and optional
  `className` and `each`. They publish focus from descendant controls and show the users focused on that target.
  Do not pass users or manually fetch presence for these wrappers.
- Frame draws an outline; gutter draws an avatar beside the target. Both use the same focus channel,
  so different layouts of the same applet can choose different presentation. Presence stays scoped
  to the same page and applet; a matching target in another view does not share it.
- With `each`, wrap a whole list or form once. Each direct child needs an explicit, unique React
  `key` identifying its data, never its array position. A child can contain nested controls or be
  a composed component; focus anywhere inside it belongs to that item. A keyed fragment is one
  item. Empty children are ignored; unkeyed children, duplicate keys, and bare text are errors.
- In `each` mode, `target` is the group namespace and each item's target is
  `target + '/' + encodeURIComponent(key)`. Reordering preserves identity; removing a child releases
  its presence. Changing the group target changes all child targets, so include the record ID for
  a form reused by different records. `className` controls the group layout.
- A nested wrapper owns focus inside its own target; its outer wrapper does not also claim it.
- `PresenceGroup` takes `children` and confines avatar movement to a related set of gutter targets.
  Use separate groups for unrelated lists or panels. `PresenceGutter each` supplies its own group,
  so it does not need another `PresenceGroup` wrapper.
- `Selection` takes `target`, controlled `selected`, `children`, and optional `className`.
- `Cursors` wraps an area and accepts optional stable `surface` and `className`. It publishes your
  pointer and displays remote pointers. No singular cursor renderer is exposed to applets.

Targets identify data, not DOM position. Use `todo:42:title`, not `row:0`. When a modal opens a
different record, change the target even if the input occupies the same DOM position. If multiple
cursor areas are mounted within an applet, give each a distinct stable surface name.

```tsx
<PresenceFrame target={`project:${project.id}`} each className="space-y-4">
  <label key="name">
    Project name
    <Input value={name} onChange={event => setName(event.target.value)} />
  </label>
  <label key="notes">
    Notes
    <Textarea value={notes} onChange={event => setNotes(event.target.value)} />
  </label>
</PresenceFrame>
```

Cursor anchors can use `data-collab-target="todo:42"` on semantic elements. This lets another
browser place the pointer relative to that element through scroll/layout changes. The API does not
provide general canvas coordinate transforms. High-frequency pointer updates are coalesced by the
host; applets do not need their own transport.

## Disabled and local modes

The same applet renders with collaboration disabled. User lookup can resolve supplied profiles;
peers and presence are empty, and publication is inert. No socket opens. With no host identity,
`useMe()` returns `null` and there is no live presence.

In local development, set an explicit profile in `/dev/collab`. Full offline user lookup needs a host
workspace directory; the local live room's fallback profiles disappear after users disconnect.
The playground uses fixture users and an isolated fake room, not a live multi-browser workspace.

Complete public types are installed in `.moi/collab-env.d.ts`. Use only the declared API.
