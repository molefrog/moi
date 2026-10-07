# View chats

A view has one permanent ID and one `views/<id>` tab from its sketch screen through
its compiled applet. The views API returns a flat union: unfinished views carry a
startup `status`, while compiled views carry `status: "compiled"`. Native transcripts
remain owned by each harness.

Chats belong to a workspace. `SessionRecord.tabId` optionally attributes a chat to
a view or Scratchpad. Completion changes neither attribution nor selection.
The displayed chat is `pinnedSessionId ?? selectedSessionIdForTab ?? null`.
A null selection means a fresh composer. Its first send creates an attached chat.

## Creation

Manual creation makes a pending view without a chat. First submission creates a
fresh chat, attaches and selects it, and sends the prompt and optional sketch.

`moi views create --requirements "…"` creates a pending view without creating or
attaching a chat. It returns `viewId`, `mode: "in-place"`, and `buildInstructions`
so the caller can continue building in its current turn. No execution session is
assigned. The CLI opens the pending view through the navigation channel.

`moi views create --from-session <id> --requirements "…"` first prepares a child
chat. Forks snapshot available source history immediately; they do not wait for
the source turn to finish. The child ID is saved before reading its history. When
that read succeeds, moi saves the last inherited turn as a display cutoff before
creating the view and sending its requirements. Unsupported forking starts a
fresh chat. Other errors stop startup.

After send acceptance, the CLI opens the pending view and its child chat through
the acknowledged navigation channel, then returns `viewId`, `mode: "handoff"`, and
`sessionId`. Navigation failure reports a warning while preserving the successful
creation result. The source agent ends its turn with a view link. The child continues
building without navigating again on completion.

CLI creation depends only on whether `--from-session` is supplied. Pin state
does not change its behavior. A pinned chat can remain visible while a forked chat
builds the view; unpinning reveals the selected child chat.
Manual submission sends to the pinned chat when present, without changing its
attribution or the new view's empty selection. Unpinning reveals an empty composer.

## Agent context

The initial build request includes the assigned view ID, source path, provisional
metadata command, available icons, and final view link. It is sent once when a chat
starts working on a pending view, including a fork or an existing pinned chat.
A fresh chat continuing a pending view receives the instructions and saved requirements.
The build instructions also supply the `moi views create --requirements …`
command for additional views. Forked build requests include a reminder to treat
inherited conversation as background.

Browser messages include `activeTab` with its ID, title, and current URL parameters.
The server adds `chatTab`, the tab this chat belongs to, which can differ from the
visible tab. Programmatic build requests omit `activeTab` when the visible tab is
unknown; the build instructions supply the target view ID separately.
Follow-ups retain tab context without pin state, session IDs, creation commands,
fork origin, or the initial build request. Pin state and fork provenance remain
internal. CLI creation reports its mode to the agent; manual submissions use the current pin.

## State and completion

`DATA_DIR/pending-views.json` holds pending views. Their startup statuses are `draft`,
`starting`, `submitted`, and `failed`. Building/waiting presentation derives from
normal session activity. `executionSessionId` tracks execution, including pinned
execution; it is never chat ownership.

`moi views set <id> --title "…" --icon <id>` updates pending metadata only. A successful
bundle reveals the compiled view, whose manifest config supplies its title/icon, and
removes the pending record. There is no completion-time chat or tab reassignment.

`DATA_DIR/sessions.json` holds attribution, fork provenance, and run settings.
`DATA_DIR/selected-sessions.json` holds per-tab selections and the workspace pin.
With Collab enabled, unpinned selections are local to each browser tab. Until a
browser tab chooses a chat, it uses the server selection so CLI view handoffs open
on their child chat. Choosing New chat saves an explicit empty selection locally.
The workspace pin remains shared.
Browser composer drafts use session identity or the fresh view-tab identity.
Native session renames move those session references together.

## Failures and history

`forkedFromSessionId` is saved immediately after child creation. When the initial child
history read finds copied turns, `forkedThroughMessageId` identifies the last
one. Inherited turns and notices stay hidden behind a context indicator. When
there is no cutoff, the full transcript remains visible. A failed initial read
does not block the build or later sends, and later reads never move the cutoff.

Startup failures preserve created chats. Errors report the child ID and, if already
created, the view ID. Interrupted startup becomes failed on restart and is never
replayed automatically. Deleting or discarding a view archives every chat attributed
to its tab, preserving attribution, history, and fork provenance. Existing workspace
chats used for pinned execution keep their attribution and remain active. Archived
chats are removed from selections and the workspace pin. An archive failure keeps the
view available to retry. A running pending view can be closed, but not discarded.
`session_archived` notifications clear the chat from every connected browser's cache and local
selections. Local selections become explicitly empty so they do not fall back to
another server-selected chat. Unrelated selections and pins remain unchanged.
