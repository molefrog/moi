# Workspace navigation

Portable addresses identify destinations inside the current workspace:

- `moi:/overview`
- `moi:/scratchpad`
- `moi:/views/events?eventId=123`
- `moi:/files/clips/video.mp4`

The host resolves workspace pages to `/workspace/<id>/views/events?eventId=123`. Domain and deployment
prefix belong to the host adapter in `lib/navigation.ts`. Tab IDs use those same workspace-relative
paths (`views/events`, `view-builders/abc`), without query strings, including in saved layouts.
The singleton agent and view-builder tabs remain host-internal routes.

## One controller

Applet `navigate(url)`, tab selection, resolved anchor clicks, and CLI requests use
`useWorkspaceNavigation`. `resolveUrl(url)` resolves pages, workspace files, and HTTP(S) addresses
for applets and chat Markdown links. Workspace pages resolve to `/workspace/<id>/...`; files resolve
to `/api/workspaces/<id>/files/...`. Both are root-relative URLs using the current
origin. Ordinary modified clicks, downloads, targets, and web links keep browser behavior.
The Markdown sanitizer admits valid moi links, including file links; moi image URLs stay sanitized.

`navigate` uses the same resolver. Workspace pages navigate within the app; files and HTTP(S)
addresses open through the browser in the current tab. CLI navigation still targets workspace pages.

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
and shows recovery to Overview. File access restrictions remain enforced by the server.

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

## Migration

`focusTab`, `moi tabs focus`, and `tab:focus` have been removed. Update applet sources to portable
addresses and rebuild. Update installed workspace guidance/types through `moi skill update`.
No workspace layout migration is needed. This change does not implement full deployment-prefix
support for unrelated assets and API endpoints.

`fileUrl` and `resolveHref` have been replaced by `resolveUrl`. Update existing applet imports,
use `moi:/files/...` addresses for files, and rebuild. File URLs still work during module evaluation,
before the host attaches the applet bridge; workspace page resolution uses that bridge.
Rebuild existing applet bundles to use the renamed `/files/` endpoint.
