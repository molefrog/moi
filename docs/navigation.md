# Workspace navigation

Portable addresses identify destinations inside the current workspace:

- `moi:/overview`
- `moi:/scratchpad`
- `moi:/views/events?eventId=123`
- `moi:/files/clips/video.mp4`

`resolveUrl` in `lib/navigation.ts` maps pages to `/workspace/<id>/...` and files to
`/api/workspaces/<id>/files/...`. Both use the current origin; the router base applies to page URLs.
Tab IDs use workspace-relative paths (`views/events`, `view-builders/abc`), without query strings.
The singleton agent and view-builder tabs remain host-internal routes.

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

Invalid action requests do not navigate. An unavailable direct browser address stays in the URL
and shows recovery to Overview.

## CLI transport

`moi tabs` lists addresses. `moi navigate <address>` validates the address format, then
uses the existing events WebSocket to address one browser. Each browser reports its displayed
workspace and focus. Server arrival order chooses the most recently focused connected browser
showing that workspace, even after focus moves to a terminal. A sole client needs no focus record;
multiple clients without a focus record require the user to focus one first.

The browser checks that the destination exists and acknowledges after applying the URL, without
waiting for view data. Only the addressed socket may settle its request.
Disconnects and workspace switches fail pending requests. The
five-second timeout does not retry: navigation may already have happened.

## Updating existing applets

Replace `fileUrl` and `resolveHref` with `resolveUrl`, using `moi:/files/...` for files.
Replace `focusTab` and `moi tabs focus` with `navigate` and `moi navigate` using portable addresses.
Run `moi skill update` to refresh guidance/types, then `moi bundle --force` to rebuild applets
for the `/files/` endpoint.

File URLs work during module evaluation; page resolution requires the applet bridge.
