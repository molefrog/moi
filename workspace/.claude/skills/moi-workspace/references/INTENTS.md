# Applet intents

Intents are functions imported from `moi` that ask the host to navigate or interact with chat.
Use them in user event handlers. Each returns `void`; there is no completion callback or result
promise. moi identifies the source applet automatically for chat actions.
For rejected chat intents, inspect `moi debug logs`.

## `focusTab(tab, params?)`

Use this to take the user to another workspace tab or view, optionally passing params.
No chat message is sent. Widgets cannot be navigation targets; their `params` is always `{}`.

### API

```ts
function focusTab(tab: string, params?: Record<string, unknown>): void
```

- `tab`: required workspace tab id. Use `overview`, `scratchpad`, or `view:<id>`.
  Run `moi tabs` to discover available tabs.
- `params`: optional JSON object describing the target view's addressable state. It arrives
  through that view's `params` prop.

### Example

```tsx
import { focusTab } from 'moi'

<button onClick={() => focusTab('view:orders', { order: 'o-1024' })}>
  Open order
</button>
```

### View params contract

A view with addressable state declares a local `Params` type in its own file. Every field is
optional and carries a comment, because the view must render sensibly with `{}` — a fresh mount, a
plain tab-bar click, or a new browser tab all deliver nothing.

```tsx
// .moi/views/orders.tsx
// The view's addressable state — what `focusTab('view:orders', …)` can set.
type Params = {
  // Order id to open in the detail pane; omit to show the list.
  order?: string
}

export default function Orders({ params = {} }: { params?: Params }) {
  // Values arrive from navigation state, so narrow before trusting them.
  const openOrder = typeof params.order === 'string' ? params.order : null
  …
}
```

**Applets never import from each other, not even types.** Before wiring a `focusTab` call, read the
target view's source, mirror the shape you find there, and note where you read it. That file is the
contract; the type is documentation, not a shared module.

## `addChatAttachment(input)`

Use this when the action may need the user's input or modification before sending. It adds
an attachment to the current draft, opens chat, and focuses the composer, keeping existing
text intact. The user can revise their message, add or remove attachments, or send attachments
on their own. Staging works while the agent is busy or unavailable.

### API

```ts
type ChatAttachmentInput =
  | { type: 'text'; label: string; text: string }
  | { type: 'file'; file: File; path?: never }
  | { type: 'file'; path: string; file?: never }

function addChatAttachment(input: ChatAttachmentInput): void
```

- Text requires a non-empty `label` (up to 120 characters) and non-blank `text` (up to 5,000
  characters). Text is preserved exactly and can contain prose, Markdown, or formatted JSON.
- Files accept exactly one browser `File` or workspace-root-relative `path`. The filename is
  the label. The existing upload limit is 32 MB; images use the existing image processing.
- Paths must point to regular files inside the workspace. Absolute paths, traversal, hidden
  path segments, and symlinks escaping the workspace are rejected.

### Examples

```tsx
import { addChatAttachment } from 'moi'

// Capture selected applet data as text.
addChatAttachment({
  type: 'text',
  label: 'Order #1042',
  text: 'Order: 1042\nStatus: delayed'
})

// Attach an existing workspace document.
addChatAttachment({ type: 'file', path: 'reports/september.pdf' })

// Attach a browser-generated file, including an exported drawing.
addChatAttachment({ type: 'file', file: generatedFile })
```

### Limits

Call from user event handlers. Text is captured immediately; workspace files are copied when
the server reads them during staging. Later changes do not update the attachment. Text appears
as a labelled chip; files use the existing file or image representation.

Invalid arguments reject the call without staging anything. File preparation failures show a
removable error chip. File loading blocks sending until it finishes. Errors are recorded in
`moi debug logs`.

Identical text from the same applet with the same label is skipped. Attachments stay with their
chat in memory and are lost on page reload. Text attachments have no preview or editing UI.

## `sendChatMessage({ message, context? })`

Use this for a complete, ready-to-run action when the user is not expected to add or change
anything before it starts. It opens chat and sends immediately to the active chat without
consuming staged draft attachments. Use action message copy that makes the immediate send clear.

### API

```ts
function sendChatMessage(input: { message: string; context?: Record<string, unknown> }): void
```

- `message`: required user-visible message. Whitespace is trimmed; empty messages are ignored.
  Maximum length: 1,000 characters.
- `context`: optional JSON object with data or task instructions for the agent, hidden from the
  visible message text. Maximum serialized length: 2,000 characters.

### Example

```tsx
import { sendChatMessage } from 'moi'

<button onClick={() => sendChatMessage({
  message: 'Chase order o-1024',
  context: { order: 'o-1024', carrier: 'dhl' }
})}>
  Chase order
</button>
```

### Limits

An oversized message is rejected. Invalid or oversized context is omitted while the message
still sends. Identical messages from the same applet within two seconds are dropped; the
workspace allows up to 10 applet sends per minute. Calls are also dropped when the agent is
unavailable.
