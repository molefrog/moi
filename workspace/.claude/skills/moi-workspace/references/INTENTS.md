# Applet intents

Intents let an applet act beyond its own UI: open another view, add context to chat, or ask the
agent to do something. Import these functions from `moi` and call them from user event handlers,
such as a button click; moi handles the action in the workspace.

## Navigation: `navigate(href)` and `resolveHref(href)`

Use the shared [workspace navigation convention](../SKILL.md#workspace-navigation) for addresses
and query params. Applets navigate through these functions:

```ts
function navigate(href: string): void
function resolveHref(href: string): string
```

```tsx
import { navigate, resolveHref } from 'moi'

const query = new URLSearchParams({ order: 'o-1024' })
const href = `moi:/views/orders?${query}`

// Prefer anchors for links: copy, middle-click, and new browser tabs work.
<a href={resolveHref(href)}>Open order</a>

// Use the same address from an event handler.
<button onClick={() => navigate(href)}>Open order</button>
```

### View params and history

The host passes query values to the view's `params` prop. Missing keys are absent. Decode numbers
and booleans explicitly, and render sensibly with empty params.

```tsx
type Params = {
  // Order id to open; omit to show the list.
  order?: string
}
type OrdersProps = { params?: Params }

export default function Orders({ params = {} }: OrdersProps) {
  const selectedOrder = params.order ?? null
  return <button onClick={() => navigate('moi:/views/orders')}>Close order</button>
}
```

See [Views](../SKILL.md#views) for which state belongs in the URL.

Normal navigation adds browser history. Back, Forward, reload, and copied links restore the address.
Tab clicks restore each tab's last address in browser memory. An explicit root link clears params.
Inactive views keep their own params. Widgets receive no params.

## `addChatAttachment(input)`

Use this when the action may need the user's input or modification before sending. It adds
an attachment to the current draft, opens chat, and focuses the composer, keeping existing
text intact. The user can revise their message, add or remove attachments, or send attachments
on their own. Staging works while the agent is busy or unavailable.

### API

```ts
type AttachmentInput =
  | { type: 'text'; label: string; text: string }
  | { type: 'file'; file: File; path?: never }
  | { type: 'file'; path: string; file?: never }

function addChatAttachment(input: AttachmentInput): void
```

- Text requires a non-empty `label` (up to 120 characters) and non-blank `text` (up to 5,000
  characters). Text is preserved exactly and can contain prose, Markdown, or formatted JSON.
- Files accept exactly one browser `File` or workspace-root-relative `path`. The filename is
  the label. The existing upload limit is 32 MB; images use the existing image processing.
- Paths must point to regular files inside the workspace. Absolute paths, traversal, hidden
  path segments, and symlinks escaping the workspace are rejected.
- A message can contain up to 10 attachments.

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

Invalid arguments reject the call without staging anything. File preparation failures remove
the attachment and show an error toast. File loading blocks sending until it finishes. Errors are recorded in
`moi debug logs`.

Identical text from the same applet with the same label is skipped. Attachments stay with their
chat in memory and are lost on page reload. Text attachments have no preview or editing UI.

## `sendChatMessage({ message, attachments? })`

Use this for a complete, ready-to-run action when the user is not expected to add or change
anything before it starts. It opens chat, prepares its attachments, and sends automatically.
The user's draft text and staged attachments stay untouched. Use action copy that makes the
immediate send clear.

### API

```ts
function sendChatMessage(input: { message: string; attachments?: AttachmentInput[] }): void
```

- `message`: required user-visible message, trimmed, non-empty, and at most 1,000 characters.
- `attachments`: optional list of `AttachmentInput` values, defined above under
  `addChatAttachment`. The same limits and snapshot behavior apply. Supplied order is preserved.

### Example

```tsx
import { sendChatMessage } from 'moi'
;<button
  onClick={() =>
    sendChatMessage({
      message: 'Review this order',
      attachments: [
        { type: 'text', label: 'Order #1042', text: 'Status: delayed' },
        { type: 'file', path: 'reports/order-1042.pdf' }
      ]
    })
  }
>
  Review order
</button>
```

### Limits

Invalid arguments or a failed attachment reject the entire send. File preparation shows a
loading notice; failures show an error and are recorded in `moi debug logs`. Switching chats
or workspaces while files are preparing cancels the send, even if the user switches back.

Identical messages from the same applet within two seconds are dropped; the workspace allows
up to 10 applet sends per minute. Calls are dropped when the agent is unavailable, including
if it becomes unavailable during preparation.
