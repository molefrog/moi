# Workspace navigation

Portable addresses identify destinations inside the current workspace:

- `moi:/overview`
- `moi:/scratchpad`
- `moi:/views/events?eventId=123`
- `moi:/chats/<session-id>`
- `moi:/files/clips/video.mp4`

The host resolves these to `/workspace/<id>/views/events?eventId=123`. Domain and deployment
prefix belong to the host adapter in `lib/navigation.ts`. Tab IDs use those same workspace-relative
paths (`views/events`), without query strings, including in saved layouts.
`resolveUrl` maps workspace files to `/api/workspaces/<id>/files/...` on the current origin.

## One controller

Applet `navigate(url)`, tab selection, resolved anchor clicks, and CLI requests use
`useWorkspaceNavigation`. It resolves URLs with `resolveUrl`: pages navigate within the app;
files and HTTP(S) URLs open in the current browser tab. CLI navigation accepts workspace pages.

Applet anchors and chat Markdown links use the same resolver. Modified clicks, downloads,
targets, and web links keep browser behavior. Markdown accepts valid moi links, including files;
moi image URLs stay sanitized. The server enforces file access restrictions.

The browser URL owns the active destination and params. Query values are strings, read with
`URLSearchParams.get()` (the first value for repeated keys), and views parse their own types.
Canonical query serialization sorts keys and preserves repeated values.
A view's detail UI must render from params and navigate when selection changes. There is no
history.state payload or two-way effect synchronizing local selection.

Navigation pushes history. Each workspace remembers its tabs'
last addresses in browser memory. A tab click restores its address; an explicit link names the
exact state to open. Only the active URL survives reload. Parked views retain their own params.
Layout persistence still stores tab order and the default tab, without query strings.

## Exact chat links

`moi:/chats/<session-id>` resolves inside the current workspace and opens the chat's
home tab, selects the chat, and reveals the sidebar or popup. Its browser address is
`/workspace/<workspace-id>/chats/<session-id>`. Chats without tab
attribution, including old Agent chats, open on Overview. Both pending and compiled
views are valid destinations. The entry route is replaced with the tab's plain URL;
it creates no separate chat tab and forwards no view parameters.

Opening a different chat unpins the workspace's current chat before selecting the
requested one. Linking to the already pinned chat preserves its pin. Selection uses
the existing persistence: browser-tab-local with Collab enabled, shared otherwise.
Missing chats or missing home tabs quietly redirect to Overview without changing
selection or the workspace pin. Navigation away cancels pending link resolution.

Copying the resulting address bar URL links to the tab. Exact chat links keep the
`moi:/chats/<session-id>` form; browser history does not track per-tab chat selections.

Invalid action requests do not navigate. An unavailable direct browser address stays in the URL
and shows recovery to Overview.

## CLI transport

`moi tabs` lists addresses. `moi navigate <address>` validates the address format, then
uses the existing events WebSocket to address one browser. Each browser reports its displayed
workspace and focus. Server arrival order chooses the most recently focused connected browser
showing that workspace, even after focus moves to a terminal. A sole client needs no focus record;
multiple clients without a focus record require the user to focus one first.

The browser checks that the destination exists and acknowledges after applying the URL, without
waiting for view data. Chat links also await resolution, unpinning when needed, and
selection persistence before acknowledging, without waiting for the transcript.
Only the addressed socket may settle its request.
Disconnects and workspace switches fail pending requests. The
five-second timeout does not retry: navigation may already have happened.

## Updating existing applets

Replace `fileUrl` and `resolveHref` with `resolveUrl`, using `moi:/files/...` for files.
Replace `focusTab` and `moi tabs focus` with `navigate` and `moi navigate` using portable addresses.
Run `moi skill update` to refresh guidance/types, then `moi bundle --force` to rebuild applets
for the `/files/` endpoint.

File URLs work during module evaluation; page resolution requires the applet bridge.
