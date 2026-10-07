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

`moi views create --source-session <id> --requirements "…"` first prepares a child
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

With a pinned chat, manual submission sends there without changing its attribution
or the new view's empty selection. CLI creation returns `mode: "in-place"` and the
view ID so the calling agent continues in its current turn. It opens the new view
with the pinned chat still visible. No fork or extra send occurs. Unpinning reveals
the view's own selection, which may be an empty composer.

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
