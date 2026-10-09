# Workspace navigation

Portable addresses identify destinations inside the current workspace:

- `moi:/overview`
- `moi:/scratchpad`
- `moi:/views/events?eventId=123`
- `moi:/chats/<session-id>`
- `moi:/files/clips/video.mp4`

The host resolves these to browser addresses such as `/workspace/<id>/views/events?eventId=123`.
Domain and deployment prefix belong to the host. Tab IDs use the same workspace-relative paths
(`views/events`), without query strings, including in saved layouts. File addresses point at the
file itself on the current origin.

## One controller

Applet navigation, tab selection, link clicks, and CLI requests all go through one controller.
Pages navigate within the app; files and HTTP(S) URLs open in the current browser tab. CLI
navigation accepts workspace pages.

Applet links and chat Markdown links resolve the same way. Modified clicks, downloads, targets,
and web links keep browser behavior. Markdown accepts valid moi links, including files; moi image
URLs stay sanitized. The server enforces file access restrictions.

The browser URL owns the active destination and its params. Query values are strings (the first
value wins for a repeated key), and views parse their own types. Canonical addresses sort query
keys and preserve repeated values. A view's detail UI must render from params and navigate when
selection changes; params live nowhere but the URL.

Navigation pushes history. Each workspace remembers its tabs' last addresses in browser memory. A
tab click restores its address; an explicit link names the exact state to open. Only the active URL
survives reload. Parked views retain their own params. Layout persistence still stores tab order
and the default tab, without query strings.

## Exact chat links

`moi:/chats/<session-id>` resolves inside the current workspace and opens the chat's home tab,
selects the chat, and reveals the sidebar or popup. Its browser address is
`/workspace/<workspace-id>/chats/<session-id>`. Chats without tab attribution, including old Agent
chats, open on Overview. Both pending and compiled views are valid destinations. The entry address
is replaced with the tab's plain URL; it creates no separate chat tab and forwards no view
parameters. Applet and CLI requests push the home tab like view links, so Back returns to the
previous page.

Opening a different chat unpins the workspace's current chat before selecting the requested one.
Linking to the already pinned chat preserves its pin. Selection uses the existing persistence:
browser-tab-local with Collab enabled, shared otherwise. Missing chats or missing home tabs quietly
redirect to Overview without changing selection or the workspace pin. Navigating away cancels a
pending link.

Copying the resulting address bar URL links to the tab. Exact chat links keep the
`moi:/chats/<session-id>` form; browser history does not track per-tab chat selections.

Invalid action requests do not navigate. An unavailable direct browser address stays in the URL
and shows recovery to Overview.

## CLI navigation

`moi tabs` lists addresses. `moi navigate <address>` validates the address format, then asks one
connected browser to navigate. Each browser reports the workspace it shows and when it was last
focused; the most recently focused browser showing that workspace is chosen, even after focus moves
to a terminal. A sole client needs no focus record; multiple clients without a focus record require
the user to focus one first.

The browser checks that the destination exists and acknowledges after applying the URL, without
waiting for view data. Chat links also wait for resolution, unpinning when needed, and selection
persistence before acknowledging, without waiting for the transcript. Disconnects and workspace
switches fail pending requests. The five-second timeout does not retry: navigation may already have
happened.
