# File uploads — the one plan

This is the canonical spec for how attachments work in moi: how Claude Code
itself does it (verified empirically, CLI + desktop), the one constraint we can't
design around, the target design for moi, and an honest gap analysis against
what's shipped today.

---

## Part 1 — Ground truth: how Claude Code handles uploads

There are **two completely separate mechanisms**. Conflating them is the source
of every "wait, is it copied or read live?" confusion.

|                                  | **A. Image / binary attach** (paste, drag, ⌘-attach)                                                                   | **B. `@`-mention** (typed path)                                                                                                                          |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trigger                          | Paste/drag an image into the prompt                                                                                    | Type `@"/path/to/file"`                                                                                                                                  |
| How the model receives it        | Decoded pixels **inline, same turn** — `{"source":{"type":"base64","media_type":"image/png","data":…}}`. No tool call. | File **text inline, same turn** — expanded into an `attachment` record of `type:"file"` (`content.file.content`, `filename`, `displayPath`, `numLines`). |
| Live vs snapshot                 | **Snapshot** — frozen at send time; survives deleting the original                                                     | **Live read** at send time; edit + re-reference → new content. Re-reference → `already_read_file` dedup record.                                          |
| Disk copy outside the transcript | **CLI: yes** → `~/.claude/image-cache/<session>/<N>.png`. **Desktop: no.**                                             | Neither — no `/tmp`, no staging, original path only                                                                                                      |
| In the transcript `.jsonl`       | Full base64 embedded inline (both clients)                                                                             | Text embedded once                                                                                                                                       |
| Non-image / huge file            | (attach is image-oriented)                                                                                             | Lands as raw/garbled text — no special handling                                                                                                          |

**CLI ↔ desktop divergence (the only real one):** both deliver images to the
model identically (inline base64 — seen instantly, no tool call). They differ
only in the _extra_ on-disk artifact:

- **Desktop:** inline base64 in the `.jsonl` is the **only** copy.
- **CLI:** _additionally_ writes `~/.claude/image-cache/<session>/<N>.png` —
  re-encoded to PNG, mode `0600`, `<N>` is a **session-global counter** (not
  per-message), **no dedup**, and the cache is **ephemeral** (GC'd between
  sessions). The message also carries an `[Image: source: …/N.png]` path token
  alongside the base64.

**What reaches the model each turn:** images → decoded pixels inline (both
clients); `@`-mentions → file text inline. A tool call only fires when the agent
_chooses_ to `Read`/`ls` to verify disk state — never to receive the content.

**Where it persists:**

```
~/.claude/projects/<encoded-cwd>/<session>.jsonl   durable: text + full base64 of
                                                   every image + expanded mention text
~/.claude/image-cache/<session>/<N>.png            CLI only: 0600, ephemeral
[Anthropic API]                                    all of the above, sent per turn
```

**Three verified rough edges** (true of both clients):

1. **Base64 is inlined into the transcript** → a couple of screenshots bloated a
   real session to ~1.5 MB.
2. **No dedup anywhere** → a bit-for-bit identical image re-pasted is stored a
   second full copy (verified: same SHA-256, two/three full base64 blocks).
3. **No lifecycle / redaction** → uploads are unencrypted-on-disk (CLI) +
   in-transcript + sent-to-API with no GC or scrub. `@`-mentioning a sensitive
   file writes its plaintext into the `.jsonl` even though no temp copy is made.

---

## Part 2 — The one constraint we can't design around

The model sees an image **only** if the bytes are in the message content as a
base64 `image` block (or a URL/`file_id` source). The Agent SDK then **persists
whatever blocks we send into the session `.jsonl`** — that transcript is
SDK-owned, not moi-owned.

So for any agent that runs through the SDK, **base64 in the transcript is
unavoidable for vision** — exactly why both Claude Code clients do it. moi cannot
dedup or de-inline the _SDK transcript_ without intercepting SDK persistence
(fragile, out of scope).

The design lever moi _does_ control is **its own layers** — upload storage,
WebSocket transport, the React Query cache, and the rendered display. Those
should never re-inline base64; that's where the bloat is fixable.

---

## Part 3 — Target design for moi

Three input pipelines, mirroring Claude Code's mental model but adapted to moi's
WS + adapter architecture.

### Pipeline 1 — Image / binary attach (paste, drag, attach button)

1. **Upload** to `POST /api/workspaces/:id/uploads` (multipart). Server:
   - downscales images with `sharp` (≤1568px long edge), normalizes to a
     vision-safe media type (or PNG);
   - **content-addresses** the bytes: `id = sha256(bytes-after-processing)`, so a
     re-pasted identical image resolves to the same stored entry (**dedup**);
   - stores bytes in the in-memory TTL store; non-images go to a temp path.
2. **Transport:** the chat WS frame carries only upload **ids** (never base64).
3. **To the agent:** `cc-session` builds base64 `image` blocks + text. _(This — and
   only this — inlines base64, because the SDK transcript requires it.)_
4. **Display:** the broadcast user turn references images by a **served URL**
   (`GET /api/workspaces/:id/uploads/:id`), **not** a data URL — so base64 never
   travels over the WS broadcast or sits in the RQ cache. On cold reload the
   adapter reconstructs from the `.jsonl` base64 (the one place it must).

### Pipeline 2 — Path / workspace-file reference (the `@`-mention analogue) — _new_

For files **already in the workspace**, copying bytes is wasteful and loses the
"live read" semantics. Add an `@`-style picker / path token that:

- inserts a path reference (no upload, no copy);
- the agent reads **live** via its `Read` tool at use time (sees current content);
- displays as a file chip, not a thumbnail.

This is the cheap, correct path for repo files — it's how power users expect it to
work and it sidesteps base64 entirely.

### Pipeline 3 — Non-image files (PDF, csv, binaries)

Written to a temp path; the path is referenced in the prompt so the agent
`Read`s it. PDFs can later upgrade to native `document` blocks (the plumbing
already supports a `kind`).

### Cross-cutting: lifecycle & redaction

- Upload store: TTL eviction (already 30 min); content-addressed entries dedup
  naturally.
- Temp files: namespaced under `$TMPDIR/moi-uploads/<id>/`; GC on TTL.
- Redaction: a "remove attachment from thread" affordance that drops the display
  reference. (The SDK `.jsonl` copy is SDK-owned; document that limitation rather
  than pretend we can scrub it.)

---

## Part 4 — Gap analysis: shipped vs. target

| Area                                            | Shipped today                                             | Target                                     | Action                       |
| ----------------------------------------------- | --------------------------------------------------------- | ------------------------------------------ | ---------------------------- |
| Upload transport                                | HTTP multipart + WS carries ids only ✅                   | same                                       | done                         |
| Image downscale/normalize (`sharp`)             | ✅                                                        | same                                       | done                         |
| Agent vision (base64 blocks)                    | ✅                                                        | same (unavoidable)                         | done                         |
| Persist/reload (adapter parses `.jsonl` base64) | ✅ (incl. folding the temp-path note back into chips)     | same                                       | done                         |
| Dedup                                           | ✅ content-hash (`sha256`) ids, workspace-scoped          | same                                       | done                         |
| Display transport                               | ✅ served URL (`GET …/uploads/:id`), sliding TTL on reads | same                                       | done                         |
| **Path / `@`-mention**                          | ❌ not supported                                          | workspace-file reference, live read        | **new feature (pipeline 2)** |
| Lifecycle TTL                                   | ✅ 30 min, refreshed on resolve/serve                     | same                                       | done                         |
| Redaction affordance                            | ❌                                                        | remove-from-thread                         | nice-to-have                 |
| OpenClaw                                        | basic (temp path appended to string message)              | content-block API when gateway supports it | tracked                      |

**Net:** the transport, agent-vision, dedup, and display halves all match the
target now. Base64 exists in exactly one place — the SDK-owned session `.jsonl`
(unavoidable, see Part 2). Still open: the `@`-mention workspace-file reference
(pipeline 2, a genuinely new feature) and the remove-from-thread redaction
affordance.

---

## Part 5 — Adding a new adapter

The display format is agent-agnostic: a `Part` of `{ type: 'file', mediaType,
url, filename }` (url = served URL preferred, data URL only as a reload
fallback). For a new backend: (1) convert resolved uploads into the backend's
message shape (base64 blocks preferred; path/file-id otherwise — `StoredUpload`
exposes `data`, `path`, and `materializeToPath()`); (2) emit `file` display
parts; (3) in the replay adapter, map the backend's stored image/document blocks
back into `file` parts so reloads render. The client (`ChatInput`, the live-store
`attachments`, `useChat.send`) is fully backend-independent.
