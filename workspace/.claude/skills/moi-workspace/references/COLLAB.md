# Collab

moi workspaces can be shared with multiple users. Use `moi/collab` in views and widgets for
user lookup, connected users, cursors, focus, and selections.

moi supplies the current user, workspace directory, and presence transport. Import the exports
directly without setting up providers or sockets. See `.moi/collab.d.ts` for the full API and
component props.

## Users

**Store only user IDs when writing user references to the server**, such as `authorId` or
`assigneeIds`. Do not copy names, emails, colors, or avatars into application records. Resolve
current profiles through hooks or components. Store applet-specific preferences and roles
separately, keyed by user ID.

```tsx
import { User, Facepile } from 'moi/collab'
;<>
  <User id={authorId} />
  <Facepile ids={assigneeIds} max={3} />
</>
```

These components resolve profiles and handle missing names and unknown IDs for you.

### Workspace users and connected users

Use the workspace directory for assignee pickers, including offline users. Use peers to show
who is connected.

| Hook                               | Returns                                                             |
| ---------------------------------- | ------------------------------------------------------------------- |
| `useMe()`                          | The current user.                                                   |
| `useUser(id)`                      | A user by ID, including an offline user.                            |
| `useWorkspaceUsers()`              | All available workspace users, including you.                       |
| `useWorkspaceUsersAvailability()`  | Whether the user directory is `loading`, `ready`, or `unavailable`. |
| `usePeers()`                       | Other connected users on the current page.                          |
| `usePeers({ scope: 'workspace' })` | Other connected users anywhere in the workspace.                    |

User results include `status`: `active` when at least one browser tab is visible in this workspace,
`away` when connected with no visible tab, or `offline` when disconnected. This tracks tab visibility,
not idle time. A user on another page can still be active.
`useWorkspaceUsers({ status: 'offline' })` filters the directory; it also accepts
`active` or `away`. `usePeers` excludes your own user, combines multiple tabs into one user,
and accepts an `active` or `away` status filter.

`useMe()` and `useUser(id)` return `undefined` when the user cannot be resolved, including while
the directory loads. A `ready` directory can be empty. When it is `unavailable`, user lists fall
back to your profile and connected users and cannot discover offline users. Applets read profiles;
the host owns profile updates and workspace membership.

## Presence

Presence is ephemeral state that describes what connected users are doing: where their pointer
is, which field they are editing, or which item they selected. It is not persisted and only
works while users are connected. It is removed when the applet becomes inactive, the browser
tab is hidden, or the publishing component unmounts.

Presence does not save or synchronize application content. Continue saving documents, tasks,
and other durable data through your applet's `.server.ts` functions and storage.
With live presence disabled, user lookups remain available and applet content still renders.

### Built-in presence

| Component        | Use                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------- |
| `Activity`       | Show you and other connected users; use `scope="workspace"` to include other pages.   |
| `Cursors`        | Wrap an area to share and display pointers. Give separate areas distinct `id` values. |
| `PresenceFrame`  | Wrap one element to show an outline and users focused inside it.                      |
| `PresenceGutter` | Wrap one element to show focused users beside it.                                     |
| `PresenceGroup`  | Scope descendant frame, gutter, and selection IDs. Adds no DOM element.               |
| `Selection`      | Wrap an item with an `id` and controlled `selected` boolean to share its selection.   |

```tsx
import { Cursors, PresenceGroup, PresenceFrame, PresenceGutter } from 'moi/collab'
import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'
;<Cursors id="task-details">
  <PresenceGroup id={task.id}>
    <PresenceFrame id="title">
      <Input defaultValue={task.title} />
    </PresenceFrame>
    <PresenceGutter id="notes">
      <Textarea defaultValue={task.notes} />
    </PresenceGutter>
  </PresenceGroup>
</Cursors>
```

Frame and gutter accept exactly one React element, including a component with nested controls;
do not use a fragment. They handle focus and user lookup. Use ordinary elements for layout.

Use stable record IDs and field names for `id`. Groups can nest: a field `title` inside task
`42` inside group `tasks` identifies `tasks/42/title`. IDs must be nonblank and unique within
their group. In lists, give each item a React `key` as well as a presence `id`; use record IDs,
not array positions. When a dialog switches records, change its group ID.

Focus, selections, and cursors are scoped to the current page and applet. Matching IDs in another
view or widget do not share presence. Groups scope frame, gutter, and selection IDs. Cursor area IDs
are local to the applet.
`Cursors` defaults to `id="default"` when there is only one area.

### Custom presence

Use a named channel for activity that the built-in components do not cover. Inside a component:

```tsx
import { usePresence, usePublishPresence } from 'moi/collab'

usePublishPresence('editing', { taskId })
const editors = usePresence<{ taskId: string }>('editing')
```

`usePublishPresence` publishes the current value and replaces it when it changes. Mount the
publishing component only while that activity is happening. Values must be JSON and no larger
than 4 KiB.

`usePresence` only reads. It returns `{ connectionId, userId, value }[]` for other connections
on the same page and applet. Resolve each `userId` with `User` or `useUser`. One user can have
separate presence values in multiple tabs, including another tab of your own user.

Channel names are local to the applet, not to `PresenceGroup`. Include record IDs in your
values when an activity belongs to a particular record.
