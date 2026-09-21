# Collaborative applets

This optional reference is installed by `moi init --experimental-collab`. Start the server with
`moi start --experimental-collab` to use shared state; there is no per-workspace flag. Follow the main workspace skill
and [DESIGN.md](DESIGN.md) for normal applet development and styling. This optional reference
describes the additional applet API; it does not require another skill or an applet provider.

## Imports and identity

Import the built-in API from `moi/collab`. Do not install an npm package or create a connection.
The host supplies the connection and current applet context. The generated `.moi/collab-env.d.ts`
provides editor types; flagged init refreshes it alongside this reference. Ordinary init and UI
workspace creation do not install collaboration documents.

The start flag enables runtime only. Shared-state hooks work without a profile; anonymous callers
do not appear in presence. `useSelf()` stays `null` until identity is supplied through `/dev/collab`
or the outer host bridge. Applets must not create an identity to read or write shared data.
Workspace Share/people controls and personal navigation require an explicit identity.

```tsx
import {
  Activity,
  Cursors,
  PresenceField,
  Selection,
  useSelf,
  useOthers,
  usePresence,
  useSharedState,
  useSharedStore
} from 'moi/collab'
```

`useSelf()` returns a participant or `null` while unavailable. Each participant has:

| Field             | Meaning                                            |
| ----------------- | -------------------------------------------------- |
| `identity.id`     | The person's stable id.                            |
| `identity.name`   | Display name supplied by the workspace.            |
| `identity.avatar` | Optional avatar URL.                               |
| `identity.color`  | Their supplied display color.                      |
| `connectionId`    | This live connection; one person may have several. |
| `location`        | Their current `{ page, title? }`, or `null`.       |
| `presence`        | Temporary registrations from their applets.        |

Read identity; do not fabricate or replace it inside applets. `useOthers()` returns other
connections on the current page. `useOthers({ scope: 'workspace' })` includes other pages.
These arrays contain connections, so the same person may appear more than once. `<Activity />`
deduplicates its avatar stack by `identity.id`.

## Components

| Component         | Props and behavior                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `<Activity />`    | Avatar stack. Optional `scope="page"` (default) or `scope="workspace"`, and `className`.                                  |
| `<Cursors>`       | Wraps a surface and displays other pointers. Accepts `children`, optional stable `surface` name and `className`.          |
| `<PresenceField>` | Wraps a control, reports focus, and shows other editors. Required stable `target`, `children`; optional `className`.      |
| `<Selection>`     | Shows other selections around an item. Required `target`, local `selected` boolean, and `children`; optional `className`. |

```tsx
<Cursors surface="tasks">
  <PresenceField target={`task/${taskId}/title`}>
    <input value={title} onChange={handleTitleChange} />
  </PresenceField>
  <Selection target={`task/${taskId}`} selected={selectedId === taskId}>
    <button onClick={() => setSelectedId(taskId)}>Select task</button>
  </Selection>
</Cursors>
```

Wrap one element and add no styling for the outline: it hugs that element and takes its corner
radius, whether it is an input, a card, a button, or a round avatar.

Targets describe data and must be stable across people, for example `task/42/title`. Do not use
array indices, display names, or random ids generated while rendering. Field and selection
wrappers also anchor cursors to meaningful items. For custom controls, an element may use
`data-collab-target="task/42"` inside `<Cursors>`.

## People components

Store ids in shared data, not profiles. A person is always given by id: the prop is `id` for one
person and `ids` for several. Each component resolves the current name, face, and status itself:
live connections first, then the workspace's people directory, which remembers everyone who has
joined. An id nobody has used renders as "Unknown person".

| Component or hook  | Props and behavior                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `usePerson(id)`    | `{ id, identity, status }`. `identity` is `null` for an unknown id. `status` is `active` (a visible tab), `away`, or `offline`. |
| `<Person />`       | Avatar and name. `id`; optional `size` (`xs` keeps one line), `avatarOnly`, `you`, `detail`, `showStatus` (true), `label`.      |
| `<Facepile />`     | Overlapping faces then a count. `ids`; optional `max` (3), `size` (`xs`, `sm`, `md`), `showStatus` (false).                     |
| `<Cursor />`       | One pointer with a name tag. `id`, `x`, `y` in the parent's coordinates; optional `label` (true).                               |
| `<PresenceFrame>`  | Outline and names around `children`; hugs a single child element and takes its radius. `ids`; optional `icon`.                  |
| `<PresenceGutter>` | A face beside the block each person is on, gliding between blocks. `people` as `{ id, target }`.                                |

The green dot (`showStatus`) means the person has this workspace open in a visible tab right now.
Away people (every tab hidden) and offline people have none. Every people component also accepts
`className`.

```tsx
// Write the id, render the person.
await tasks.set(`${id}/assignee`, self.identity.id)
<Person id={String(tasks.entries[`${id}/assignee`])} size="xs" />
<Facepile ids={others.map(other => other.identity.id)} />
```

Presence is advisory. A colored field does not lock it or save its value. `<Selection>` reports
your local selection; keep `selectedId` in local React state. Multiple cursor surfaces in one
applet need different stable `surface` names. Free space in differently arranged canvases has
no automatic shared coordinate system; use semantic targets for items.

## Temporary presence

```tsx
const selection = usePresence<{ taskId: string | null }>('selection', { taskId: null })

// From an event handler:
selection.setValue({ taskId: '42' })

// Other mounted registrations on this applet surface and channel:
selection.others.map(({ participant, value }) => ({
  name: participant.identity.name,
  taskId: value.taskId
}))
```

`usePresence(channel, initialValue)` returns `{ value, setValue, others }`.
`setValue` replaces the complete channel value; it is not a partial patch and is not persistent.
Each hook registration belongs to its own mount. A different widget cannot clear its state.
Cleanup, hiding, and rebuilding applets remove inactive presence automatically. Use presence for
cursors, focused items, and selections; use shared storage for information that must survive a refresh.

## Shared values and readiness

```tsx
const done = useSharedState<boolean>('task/42/done', {
  scope: 'shared:tasks',
  defaultValue: false
})

if (!done.loaded) return <p>Loading…</p>

return (
  <input
    type="checkbox"
    checked={done.value === true}
    disabled={!done.canWrite}
    onChange={event => void done.setValue(event.target.checked)}
  />
)
```

The result exposes `value`, `exists`, `loaded`, `canWrite`, `isSaving`, `error`,
`setValue(value)`, and `deleteValue()`.

- Before `loaded`, the value is unavailable. `canWrite` also requires a live connection.
- `defaultValue` is a display fallback after loading confirms the key is absent. It never writes
  data. Mounting or remounting a hook cannot recreate a deleted value.
- Save methods return promises that resolve with `{ status: 'committed', revision }` or
  `{ status: 'rejected' | 'unknown', message }`. Handle the result or visibly render `error`.
- `unknown` means a save could not be confirmed. Keep the user's draft and let them deliberately
  reapply it after reconnecting. Do not automatically replay old or offline edits.
- Local optimistic changes may appear while `isSaving` is true. Treat `committed` as confirmation.
- There is no built-in save indicator. Render `isSaving` and `error` where the person is editing.

```tsx
const outcome = await title.setValue(draft)
if (outcome.status === 'committed') {
  setEditing(false)
} else {
  setError(outcome.message) // Keep draft available.
}
```

The default storage scope is `applet:<kind>:<name>`, for example `applet:view:board`. It survives
rebuilds. Use an explicit scope such as `shared:tasks` when several widgets/views share data.
Renaming an applet changes its default scope; choose a stable explicit scope when needed.

## Collections, fields, and batches

`useSharedStore(prefix, { scope })` returns prefix-relative `entries`, `set`, `delete`, `batch`,
and the same `loaded`, `canWrite`, `isSaving`, and `error` status fields. Never mutate `entries`
directly. With prefix `task/`, entry `42/title` addresses the full key `task/42/title`.

```tsx
const tasks = useSharedStore('task/', { scope: 'shared:tasks' })
const id = crypto.randomUUID() // Create once in the Add task event handler.

await tasks.batch([
  { type: 'set', key: `${id}/exists`, value: true },
  { type: 'set', key: `${id}/title`, value: 'Ship demo' },
  { type: 'set', key: `${id}/done`, value: false }
])

await tasks.set(`${id}/done`, true)

await tasks.batch([
  { type: 'delete', key: `${id}/exists` },
  { type: 'delete', key: `${id}/title` },
  { type: 'delete', key: `${id}/done` }
])
```

A batch applies all its changes together within one scope. Creating a task writes its membership
and initial fields together. Deleting it removes membership and its known fields together. List
tasks only from `/exists` keys whose value is `true`; a delayed title edit then cannot make a
deleted task visible again. Only explicit creation/restoration writes membership.

Different field keys merge independently: one person can change a title while another checks
the task. On the same key, the last committed write wins. Arrays and objects are each one value;
replacing an entire task array may overwrite another person's work. Use small field keys.
Strings are replaced, not collaboratively merged character by character. A local read followed by
`set` does not provide an atomic counter increment or enforce a reservation rule.

Values must be plain JSON: no functions, dates, undefined, cycles, or non-finite numbers.
Keep values under 64 KiB and mutations under 256 KiB/100 operations. Prefer compact records to
large blobs. All persistent writes go through this API or the workspace's collab command access;
do not modify the underlying shared storage files.

## Complete task-list view

This example uses native controls; use the workspace's installed UI components for final styling.
It creates tasks only in an event handler, keeps collection membership explicit, and shows save
errors. Put it in a view source file and rebuild with `moi bundle`.

```tsx
import { useState } from 'react'
import { Activity, Cursors, PresenceField, useSharedStore } from 'moi/collab'

export const config = { title: 'Team tasks' }

export default function TeamTasks() {
  const tasks = useSharedStore('task/', { scope: 'shared:tasks' })
  const [draft, setDraft] = useState('')
  const ids = Object.keys(tasks.entries)
    .filter(key => key.endsWith('/exists') && tasks.entries[key] === true)
    .map(key => key.slice(0, -'/exists'.length))

  async function addTask() {
    const title = draft.trim()
    if (!title || !tasks.canWrite) return
    const id = crypto.randomUUID()
    const outcome = await tasks.batch([
      { type: 'set', key: `${id}/exists`, value: true },
      { type: 'set', key: `${id}/title`, value: title },
      { type: 'set', key: `${id}/done`, value: false }
    ])
    if (outcome.status === 'committed') setDraft(current => (current === draft ? '' : current))
  }

  if (!tasks.loaded) return <p>Loading tasks…</p>

  return (
    <Cursors surface="tasks" className="space-y-4 p-4">
      <header className="flex items-center justify-between gap-3">
        <h1>Team tasks</h1>
        <Activity />
      </header>
      <form
        className="flex gap-2"
        onSubmit={event => {
          event.preventDefault()
          void addTask()
        }}
      >
        <input
          aria-label="New task"
          value={draft}
          onChange={event => setDraft(event.target.value)}
        />
        <button type="submit" disabled={!tasks.canWrite || !draft.trim()}>
          Add task
        </button>
      </form>
      {tasks.error && <p role="alert">{tasks.error}</p>}
      {ids.map(id => (
        <section key={id} data-collab-target={`task/${id}`} className="flex items-center gap-3">
          <input
            type="checkbox"
            aria-label="Task complete"
            checked={tasks.entries[`${id}/done`] === true}
            disabled={!tasks.canWrite}
            onChange={event => void tasks.set(`${id}/done`, event.target.checked)}
          />
          <PresenceField target={`task/${id}/title`}>
            <input
              aria-label="Task title"
              value={String(tasks.entries[`${id}/title`] ?? '')}
              disabled={!tasks.canWrite}
              onChange={event => void tasks.set(`${id}/title`, event.target.value)}
            />
          </PresenceField>
          <button
            type="button"
            disabled={!tasks.canWrite}
            onClick={() =>
              void tasks.batch([
                { type: 'delete', key: `${id}/exists` },
                { type: 'delete', key: `${id}/title` },
                { type: 'delete', key: `${id}/done` }
              ])
            }
          >
            Delete task
          </button>
        </section>
      ))}
    </Cursors>
  )
}
```

## Before considering an applet complete

Try it in two browser tabs with different participants. Edit different fields, then the same field.
Delete an item while the other tab is editing it. Refresh and confirm the data remains. Navigate
away and confirm stale focus/cursors disappear. Disconnect and confirm the UI preserves drafts and
shows an unresolved save rather than silently claiming success. Keep personal navigation and
selections local; sharing data does not require making everyone look at the same view.
