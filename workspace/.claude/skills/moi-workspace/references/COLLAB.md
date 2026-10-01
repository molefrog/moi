# Collab

moi workspaces can be shared with multiple users. Use `moi/collab` in views and widgets to
show users and share cursors, focus, selections, and custom presence. moi supplies identity,
workspace membership, and the connection. Import the API directly; no provider or socket
setup is needed.

See `.moi/collab.d.ts` for the full types and props.

## Users

Store **only** user IDs in application records, such as `authorId` or `assigneeIds`. Resolve their
current profiles through hooks or components. Keep applet-specific roles and preferences
separately, keyed by user ID. The host owns profile updates and workspace membership.

User results include a `status`:

- `active`: at least one connected browser tab is visible in this workspace.
- `away`: connected, with no visible tab in this workspace.
- `offline`: no connection in this workspace.

This tracks tab visibility, not idle time. A user on another page can still be active.

### Hooks

#### `useMe` and `useUser`

`useMe()` resolves the current user. `useUser(id)` resolves a stored user reference,
including an offline member. Both return `undefined` when the profile cannot be resolved,
including while the workspace directory loads. Handle that before reading profile fields.

#### `useWorkspaceUsers` and `usePeers`

Use `useWorkspaceUsers()` for assignee pickers and member lists. It includes your own user
and offline members. Filter with `status: 'active'`, `'away'`, or `'offline'`.

Use `usePeers()` to find other connected users on the current page. It excludes your own
user and combines multiple browser tabs into one user. Set `scope: 'workspace'` to include
other pages; its status filter accepts `'active'` or `'away'`.

A host-supplied directory is authoritative, including an empty list. Without one, user
lookups fall back to your profile and connected users; they cannot discover offline members.

### Components

#### `User` and `UserAvatar`

`User` shows an avatar and name, with optional secondary `description` text. `UserAvatar` shows
only the avatar. Pass a user ID; both handle missing names and unknown users.

`User` and `UserAvatar` hide the status badge by default; pass `showStatusBadge` to show it
for active users.

#### `UserAvatarGroup`

Show several users together. IDs are deduplicated; `max` limits the visible avatars and
remaining users appear as an overflow count.

## Presence

Presence describes temporary activity: pointer positions, focused fields, selected items,
or custom state. It is removed when its publishing component unmounts, the applet becomes
inactive, or the browser tab is hidden.

Save durable application content through your applet's `.server.ts` functions and storage.
Presence does not persist it. With live presence disabled, user lookups remain available
and applet content still renders.

Presence is scoped to the current page and applet. Matching IDs or channels in another
view or widget do not share activity.

### Hooks

#### `usePresence` and `usePublishPresence`

Use these together for activity that the built-in components do not cover.
`usePublishPresence(channel, value)` publishes a value and replaces it when it changes.
Values must be JSON and no larger than 4 KiB.

`usePresence<T>(channel)` reads other connections' `{ connectionId, userId, value }` entries.
Reading never publishes presence. One user can have multiple entries, including another tab
of your own user. Resolve each `userId` with `User` or `useUser`.

```tsx
import { usePresence, usePublishPresence, User } from 'moi/collab'

type TaskPresenceProps = { taskId: string }

// Mount this component only while the viewer is editing the task.
function EditingPresence({ taskId }: TaskPresenceProps) {
  usePublishPresence('editing', { taskId })
  return null
}

function TaskEditors({ taskId }: TaskPresenceProps) {
  const editors = usePresence<{ taskId: string }>('editing')
  return editors
    .filter(entry => entry.value.taskId === taskId)
    .map(entry => <User key={entry.connectionId} id={entry.userId} />)
}
```

Channel names are local to the applet and unaffected by `PresenceGroup`. Include record IDs
in your values when activity belongs to a particular record. Unmount the publishing component
to stop publishing; `false` and `null` are valid custom values, not removal signals.

### Components

#### `Cursors`

Wrap the area where users should see each other's pointers. Give separate areas distinct
`id` values. A single area can omit `id`, which defaults to `"default"`.

```tsx
import { Cursors } from 'moi/collab'

<Cursors id="board">{children}</Cursors>
```

#### `FocusFrame` and `FocusAvatars`

Wrap a field or section to show users focused inside it. `FocusFrame` adds an outline
and user labels; `FocusAvatars` places avatars beside it. Each accepts exactly one React
element, including a component containing multiple controls. Do not pass a fragment.

```tsx
import { FocusFrame, FocusAvatars } from 'moi/collab'
import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'

<>
  <FocusFrame id="title">
    <Input aria-label="Title" />
  </FocusFrame>
  <FocusAvatars id="notes">
    <Textarea aria-label="Notes" />
  </FocusAvatars>
</>
```

#### `Selection`

Wrap an item and pass your local selection through `selected`. The component displays
other users who selected that item. Your app controls its selection state.

```tsx
import { useState } from 'react'
import { Selection } from 'moi/collab'

type SelectableTaskProps = { taskId: string }

function SelectableTask({ taskId }: SelectableTaskProps) {
  const [selected, setSelected] = useState(false)
  return (
    <Selection id={taskId} selected={selected}>
      <button onClick={() => setSelected(value => !value)}>Select task</button>
    </Selection>
  )
}
```

#### `PresenceGroup`

Give repeated fields a namespace, such as a task ID. Descendant frame, gutter, and selection
IDs combine with their groups. Groups can nest and add no DOM element.

```tsx
import { PresenceGroup, FocusFrame } from 'moi/collab'
import { Input } from '../ui/input'

<PresenceGroup id={task.id}>
  <FocusFrame id="title">
    <Input aria-label="Task title" defaultValue={task.title} />
  </FocusFrame>
</PresenceGroup>
```

Use stable record IDs and field names. For example, `title` inside group `42` inside group
`tasks` identifies `tasks/42/title`. IDs must be nonblank and unique within their group.
In lists, use record IDs for both React `key` and presence `id`. When a dialog switches
records, change its group ID. Cursor area IDs are independent of groups.
