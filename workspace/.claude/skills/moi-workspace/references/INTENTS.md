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

## `addChatContext({ label, context })`

Use this when the action may need the user's input or modification before sending. It adds
a removable chip to the current draft, opens chat, and focuses the composer, keeping existing
text intact. The user can write or revise their message, add more attachments, remove chips,
or send context on its own.

### API

```ts
function addChatContext(input: {
  label: string
  context: Record<string, unknown>
}): void
```

- `label`: required non-empty label, up to 120 characters, shown on the attachment chip.
- `context`: required plain JSON object, up to 5,000 serialized characters. Include the data the
  agent needs to understand the item.

### Example

```tsx
import { addChatContext } from 'moi'

<button onClick={() => addChatContext({
  label: 'Order #1042',
  context: { orderId: '1042', status: 'delayed' }
})}>
  Add to chat
</button>
```

### Limits

Data is validated and copied at click time. The snapshot cannot be edited in the composer,
and later applet changes do not affect it.
Invalid data rejects the whole call. Identical source, label, and JSON payloads are skipped.
Context items can be staged alongside files and drawings.

Staging works while the agent is busy or unavailable. Draft attachments stay with their chat
in memory and are lost on page reload. No file is uploaded.

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
