# File / image attachments

Drag-drop, paste, or attach files in the chat composer — like the Claude Code
desktop app. This documents how it works, what the Agent SDK expects, and how the
pipeline extends to OpenClaw and future adapters.

## What Claude Code / the Agent SDK expects

A streaming-input session yields `SDKUserMessage`s whose `message` is an Anthropic
`MessageParam`:

```ts
type MessageParam = { role: 'user' | 'assistant'; content: string | ContentBlockParam[] }
```

`content` may be a plain string **or** an array of content blocks. For
attachments the relevant blocks are:

- `ImageBlockParam` — `{ type: 'image', source: { type: 'base64', media_type, data } }`
  (also accepts a `url` source). `media_type` is one of
  `image/jpeg | image/png | image/gif | image/webp`.
- `DocumentBlockParam` — PDFs (`application/pdf` base64) and plain-text sources.

The SDK persists whatever blocks you send into the session `.jsonl`, so an
attached image is stored inline as base64 in the transcript — there is no
separate sidecar file. That means **persistence and cold-reload come for free**:
we only need the adapter to parse those blocks back out when replaying a session.

Anthropic's guidance: downscale images to a long edge ≤ 1568px for the best
cost/latency (no quality loss for the model), keep ≤ ~5MB per image, and inline
small images as base64 rather than round-tripping the Files API.

## moi's pipeline (Claude Code)

```
composer (drop/paste/attach)
  → POST /api/workspaces/:id/uploads        (multipart, one or many files)
      → server/uploads.ts: sharp downscale/transcode, stash bytes in-memory (TTL)
      ← UploadInfo[] { id, kind, mediaType, filename, size, width?, height? }
  → WS chat frame { content, attachments: uploadId[] }
      → server/cc-session.ts: resolveUploads → build SDKUserMessage content:
          images  → base64 image blocks (native vision)
          files   → written to a temp path, referenced in the prompt text
        and broadcast the user turn with `file` display parts (data URLs)
  → agent runs; SDK persists the image blocks to the session .jsonl
  → on reload, state.ts replays the .jsonl through ClaudeAdapter, which turns
    base64 image blocks back into `file` parts → thumbnails render again
```

Why an HTTP upload instead of base64 over the WebSocket:

- Keeps chat frames (and the user-turn broadcast that fans out to every tab)
  small — a 4MB screenshot would otherwise bloat every frame.
- Lets us downscale once, server-side, with `sharp` (already a dependency).
- Gives non-image files a real path the agent can `Read`.

Upload bytes are short-lived (a 30-minute TTL in the in-memory store); the
durable copy is the base64 block the SDK writes to the `.jsonl`.

### Key files

- `server/uploads.ts` — upload store, `sharp` processing, `resolveUploads`,
  display-part / data-URL / `materializeToPath` helpers.
- `server/api.ts` — `POST /api/workspaces/:id/uploads`.
- `server/cc-session.ts` — `buildUserMessage()` turns text + uploads into the
  SDK content blocks and the broadcast display parts.
- `lib/claude-adapter.ts` — parses persisted `image`/`document` blocks
  (base64 or url source) into `file` parts.
- `client/lib/uploads.ts` — `uploadFiles()`.
- `client/store/live.ts` — per-thread `attachments` state (mirrors `drafts`).
- `client/components/ChatInput.tsx` — attach button, paste, drag-drop, thumbnails.
- `client/components/TurnView.tsx` — renders image/file parts in the bubble.

## OpenClaw (basic support today)

The OpenClaw gateway's `sessions.send` RPC currently accepts only a **string**
message — there is no content-block channel. So `sendOpenClawMessage` does the
honest minimal thing: it materializes each upload to a temp file
(`materializeToPath`) and appends the paths to the message text, so an OpenClaw
agent with file/vision tools can open them. There is no inline vision and the
appended paths are visible in the rendered turn.

To make OpenClaw first-class, the gateway needs a content-block message API
(images as base64 or file ids, à la the Anthropic shape). When that lands:

1. Extend the `sessions.send` payload with a `content` array (text + image/file
   blocks), keeping `message` for back-compat.
2. In `sendOpenClawMessage`, build blocks from `resolveUploads` instead of
   appending paths (reuse the `buildUserMessage` logic, factored into a shared
   helper).
3. Teach `server/openclaw-adapter.ts` `blockToPart` to map the gateway's stored
   image/file blocks into `file` parts (it already has the `default: return null`
   slot where image blocks are currently dropped), so reloads render thumbnails.

## Adding a new adapter

The display format is agent-agnostic: a `Part` of `{ type: 'file', mediaType,
url, filename }` is all the UI needs (`url` may be a data URL or a served URL).
For a new backend:

1. **Inbound** — convert resolved uploads into whatever the backend's message API
   accepts (base64 blocks preferred; a file path or upload id otherwise). The
   `StoredUpload` record exposes `data` (image bytes), `path` (file uploads), and
   `materializeToPath()` to cover both.
2. **Display** — emit a `file` part for the user's turn (use
   `uploadToDisplayPart` for live turns).
3. **Persistence/reload** — in the adapter that replays the backend's transcript,
   map its stored image/document blocks back into `file` parts so attachments
   survive a reload.

The client (`ChatInput`, the live-store `attachments`, `useChat.send`) is fully
adapter-independent — it always uploads via the same endpoint and sends upload
ids. Only the server-side send path and the replay adapter are per-backend.

## Limits & follow-ups

- Images are downscaled to ≤ 1568px long edge; non-vision image types transcode
  to PNG; GIFs pass through. Per-file cap: 32MB raw upload.
- Not yet done: PDF `document` blocks (the plumbing supports it — add a `kind`
  and a `DocumentBlockParam` branch in `buildUserMessage`), a dedicated GET route
  to stream uploads (we inline data URLs instead), and richer non-image previews.
