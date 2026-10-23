# View chats

A view has one permanent ID and one `views/<id>` tab from its sketch screen through
its compiled applet. The views API returns a flat union: unfinished views carry a
startup `status`, while compiled views carry `status: "compiled"`. `GET /views` lists
compiled views; unfinished ones come from the workspace state (`GET /state`), and the
client merges the two. Native transcripts remain owned by each harness.

Chats belong to a workspace. A chat's `tabId` in the workspace state optionally attributes it to
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
that read succeeds, Moi saves the last inherited turn as a display cutoff before
creating the view and sending its requirements. Unsupported forking starts a
fresh chat. Other errors stop startup.

After send acceptance, the CLI opens the pending view and its child chat through
the acknowledged navigation channel, then returns `viewId`, `mode: "handoff"`, and
`sessionId`. Navigation failure reports a warning while preserving the successful
creation result. The source agent ends its turn with a view link. The child continues
building without navigating again on completion.

Manual submission sends to the pinned chat when present, without changing its
attribution or the new view's empty selection. Pin state does not affect CLI creation.
Unpinning reveals the view's selected chat or an empty composer.

## Agent context

Build instructions are sent once when a chat starts working on a pending view.
They supply the view ID, source path, metadata command, icons, and final link.
A fresh chat receives the saved requirements and can resume only when the previous
builder is idle. Forked requests include a reminder to treat inherited history as background.

Browser messages include `activeTab` with its ID, title, and URL parameters, plus
`applet: { kind, id }` for applet sends. The server supplies `session: { id, tabId, pinned }`
on every send. Matching applet and active-view details are rendered once. Programmatic
sends omit an unknown `activeTab`; fork provenance remains internal. Agents build in
place when pinned and use `--from-session` with the current session ID otherwise.

## State and completion

Each workspace's `DATA_DIR/workspaces/<workspace id>/state.json` holds its pending
views. Their startup statuses are `draft`, `starting`, `submitted`, and `failed`.
Building/waiting presentation derives from normal session activity.
`buildSessionId` identifies the builder, including
pinned execution, independently of chat attribution. Ordinary messages update build state
only when the sending chat matches this ID.

`moi views set <id> --title "…" --icon <id>` updates pending metadata only. A successful
bundle reveals the compiled view, whose manifest config supplies its title/icon, and
removes the pending record. There is no completion-time chat or tab reassignment.

The same `state.json` holds chat attribution, fork provenance, and run settings, plus
per-tab selections and the workspace pin. Submitting a view and renaming a chat each
update it in one write. `GET /api/workspaces/:id/state` returns it; every write
(`PUT`/`DELETE /sessions/:id/pin`, `PUT`/`DELETE /sessions/:id/selection`,
`PATCH /sessions/:id/config`, `POST /sessions/:id/archive`) answers with the new state,
and every change is published as `state:changed` with the whole state. A `revision`
that goes up with each change lets clients drop an older copy that arrives late.
With Collab enabled, unpinned selections are local to each browser tab. Until a
browser tab chooses a chat, it uses the server selection so CLI view handoffs open
on their child chat. Choosing New chat saves an explicit empty selection locally.
The workspace pin remains shared.
Browser composer drafts use session identity or the fresh view-tab identity.
Native session renames move those session references together.

## Failures and history

`fork.fromSessionId` is saved immediately after child creation. When the initial child
history read finds copied turns, `fork.throughMessageId` identifies the last
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

## Implementation

`server/sessions/view-sessions.ts` coordinates sends and view handoffs.
`pending-views.ts` in the same directory owns pending-view persistence;
`store.ts` owns chat entries, `selected.ts` owns selections and pins,
`archive.ts` owns archiving, and `lifecycle.ts` coordinates ID renames.
Compiled view manifests and build completion live in `server/applets/views.ts`.
CLI creation and metadata commands live in `server/cli/commands/views.ts`.
On the client, `client/features/workspace/workspace-state.ts` owns the one state cache,
its writes, and the app-wide `state:changed` listener.
