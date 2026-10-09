# Workspace navigation

The idea is to give the whole workspace one way to say “open this, showing this state.”

moi links point to places in the current workspace:
`moi:/views/events?eventId=123` becomes `/workspace/<id>/views/events?eventId=123`.
moi fills in the workspace ID and server address. Use `moi:/` with one slash.

The browser URL sets the open tab and passes values to views. All ways of opening a workspace
link follow the same rules.

Where links are used:

- Widgets and views: `resolveUrl()` for links, `navigate()` for button actions.
- Chat messages: Markdown links, such as `[Open event](moi:/views/events?eventId=123)`.
- Tab bar: return to the last page opened in a tab.
- CLI: `moi tabs` lists links; `moi navigate '<address>'` opens one.
- Browser address bar: copy, bookmark, or open a page URL.

## Link types

- **Built-in tabs:** `moi:/overview` and `moi:/scratchpad` open their respective tabs.
  Query values are not passed to widgets or built-in UI.
- **Views:** `moi:/views/events?eventId=123` opens the `events` view. Query values become
  its component's `params` prop: `{ eventId: '123' }`.
- **Chats:** `moi:/chats/<session-id>` selects an existing chat, opens its home tab, and
  reveals the chat panel. The URL becomes the home tab's plain URL; query values are not
  forwarded to the view.
- **Files:** `moi:/files/clips/video.mp4` opens a file relative to the workspace root through
  `/api/workspaces/<id>/files/clips/video.mp4`. Query strings and fragments stay on the file URL.
- **Web addresses:** `https://example.com` (or HTTP) opens an ordinary web address.
  Its query values go to that destination.

Chats without tab attribution use Overview. Missing chats or missing home tabs fall back to
Overview without changing selection. Opening a different chat unpins the current chat.
Share the `moi:/chats/<session-id>` link to identify an exact chat; the resulting address bar URL identifies only its tab.

## View parameters

The host decodes the query and renders `<View params={...} />`. Values are strings; the first
value wins for repeated keys. Views parse numbers and booleans themselves. Read selection from
`params` and change it by navigating, so links, reload, and Back restore the same state.

```tsx
import { navigate, resolveUrl } from 'moi'

type Props = { params?: Record<string, string> }

export default function Events({ params = {} }: Props) {
  return (
    <>
      <p>Selected event: {params.eventId ?? 'none'}</p>
      <a href={resolveUrl('moi:/views/events?eventId=123')}>Open event 123</a>
      <button onClick={() => navigate('moi:/views/events')}>Clear selection</button>
    </>
  )
}
```

Widgets receive no `params`. Chat messages carry the active view's non-empty params to the
agent as `activeTab.params` in the moi context.

Workspace pages add browser history; files and web addresses open in the current browser tab.
Modified clicks, downloads, and explicit link targets retain browser behavior.

A tab click restores its last address from browser memory; an explicit link opens exactly the
state it names. Parked views keep their own params. Reload preserves only the active URL.
Saved layouts store tab paths such as `views/events`, tab order, and the default tab, without query strings.
