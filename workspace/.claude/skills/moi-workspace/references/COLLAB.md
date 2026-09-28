# Collab

moi workspaces can be shared with multiple users. This guide explains the primitives in
`moi/collab` that make views and widgets ready for real-time collaboration: user lookup,
connected users, cursors, focus, and selections.

## Concepts

### User profiles

Every user has a unique, stable `id` and a `color`. A profile can also include `name`, `email`,
and `avatar`; these fields are optional, and a name can be empty.

**Store only user IDs when writing user references to the server**, such as `authorId` or
`assigneeIds`. Do not copy names, emails, colors, or avatars into application records. Resolve
current profiles through the hooks and components below. Applet-specific data, such as a user's
preferences or role in a project, can be stored separately and keyed by user ID.

```tsx
import { User, Facepile } from 'moi/collab'

<User id={authorId} />
<Facepile ids={assigneeIds} max={3} />
```

These components resolve profiles and handle missing names and unknown IDs for you.

### Workspace users and connected users

Workspace users include users who are offline. Use the full user directory for assignee pickers
and other user references. Query connected users to show who is here
or working on the same page.

| Hook                                       | Returns                                                              |
| ------------------------------------------ | -------------------------------------------------------------------- |
| `useMe()`                                  | The current user.                                                    |
| `useUser(id)`                              | A user by ID, including an offline user.                             |
| `useWorkspaceUsers()`                      | All available workspace users, including you.                        |
| `useWorkspaceUsers({ status: 'offline' })` | Users who are offline. The filter also accepts `active` or `away`.  |
| `useWorkspaceUsersAvailability()`         | Whether the user directory is `loading`, `ready`, or `unavailable`.  |
| `usePeers()`                               | Other connected users on the current page.                           |
| `usePeers({ scope: 'workspace' })`         | Other connected users anywhere in the workspace.                     |

User results include `status`: `active` when at least one workspace connection has a visible
page, `away` when connected without a visible page, or `offline` when disconnected. A user on
another page can still be active. `usePeers` excludes your own user, combines multiple tabs
into one user, and can filter by `status: 'active'` or `'away'`.

`useMe()` and `useUser(id)` return `null` when the user cannot be resolved. When the user directory
is unavailable, enumeration falls back to your profile and connected users; it cannot
discover offline users.

### Provided by moi

moi supplies the current user, the user directory, and the connection between applets. You do not need
to set up transport, sockets, or providers. Use the exports from `moi/collab` directly; applets
read user profiles rather than creating or updating them.

## Presence

Presence is ephemeral state that describes what connected users are doing: where their pointer
is, which field they are editing, or which item they selected. It is not persisted and only
works while users are connected. Registrations are removed when their applet becomes inactive,
the browser tab is hidden, or the publishing component unmounts.

Presence does not save or synchronize application content. Continue saving documents, tasks,
and other durable data through your applet's `.server.ts` functions and storage.

### Built-in presence

| Component        | Use                                                                                       |
| ---------------- | ----------------------------------------------------------------------------------------- |
| `Activity`       | Show you and other connected users; use `scope="workspace"` to include other pages.       |
| `Cursors`        | Wrap an area to share and display pointers. Give separate areas distinct `surface` names. |
| `PresenceFrame`  | Wrap one element to show an outline and users focused inside it.                          |
| `PresenceGutter` | Wrap one element to show focused users beside it.                                         |
| `PresenceGroup`  | Scope descendant frame, gutter, and selection IDs. Adds no DOM element.                   |
| `Selection`      | Wrap an item with an `id` and controlled `selected` boolean to share its selection.       |

```tsx
import { Cursors, PresenceGroup, PresenceFrame, PresenceGutter } from 'moi/collab'

;<Cursors surface="task-details">
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

Frame and gutter each accept exactly one React element, such as an input, label, or card with
controls inside it; do not use a fragment. They handle focus and user lookup automatically.
Use ordinary elements for layout; a group only provides scoping.

Use stable record IDs and field names for `id`. Groups can nest: a field `title` inside task
`42` inside group `tasks` identifies `tasks/42/title`. IDs must be nonblank and unique within
their group. In lists, give each item a React `key` as well as a presence `id`; use record IDs,
not array positions. When a dialog switches records, change its group ID.

Focus, selections, and cursors are scoped to the current page and applet. Matching IDs in an
unrelated view or widget do not share presence.

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
separate presence values in multiple tabs.

Channel names are local to the applet, not to `PresenceGroup`. Include record IDs in your
values when an activity belongs to a particular record.

## Component props cheat sheet

All components accept optional `className: string` except `PresenceGroup`. The last column
lists optional props, with defaults where applicable.

| Component                          | Required props                                           | Optional props and defaults                                                                                                    |
| ---------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `User`                             | `id: string`                                             | `size="md"` (`xs`, `sm`, `md`, `lg`); `avatarOnly=false`; `you=false`; `detail: ReactNode`; `showStatus=true`; `label: string` |
| `Facepile`                         | `ids: readonly string[]`                                 | `size="sm"` (`xs`, `sm`, `md`); `max=3`; `showStatus=false`                                                                    |
| `Activity`                         | None                                                     | `scope="page"` (`page`, `workspace`)                                                                                           |
| `Cursors`                          | `children: ReactNode`                                    | `surface="default"` (string)                                                                                                   |
| `PresenceFrame` / `PresenceGutter` | `id: string`; `children`: exactly one React element      | None beyond `className`                                                                                                        |
| `PresenceGroup`                    | `id: string`; `children: ReactNode`                      | None                                                                                                                           |
| `Selection`                        | `id: string`; `selected: boolean`; `children: ReactNode` | None beyond `className`                                                                                                        |

- `User`: `avatarOnly` hides the visible name and detail; `you` adds a manual “(you)” suffix;
  `detail` adds secondary content. `label` sets the avatar tooltip and accessible label, not
  the visible user name. `showStatus` shows a dot for active users.
- `Facepile`: duplicate IDs appear once; users beyond `max` become a `+N` overflow indicator.
- Only `User` and `Facepile` accept `size`. `Activity` shows all matching users and has no
  `size` or `max` prop.

See `.moi/collab.d.ts` for the complete public types and component props.
