# Tools, WebMCP and server functions

A tool is a named operation on a target, with a description, an input schema and
an `execute` handler. It can run on the Bun server or inside a view's React
component. Agents discover tools with `moi tools` and call them with `moi call`.

WebMCP gives browser agents access to those same operations. Existing server
functions keep their RPC path so already-built views continue to work.

## Choosing an interface

| Need                                                                      | Use                                 | Where it runs       |
| ------------------------------------------------------------------------- | ----------------------------------- | ------------------- |
| Read or update persisted data, use secrets, access files or APIs          | Server tool                         | Bun function worker |
| Change filters, selection, an unsaved draft or other live component state | UI tool                             | Active React view   |
| Share backend implementation between operations                           | Ordinary backend helper             | Bun function worker |
| Open a view with navigation parameters                                    | `focusTab` or `moi tab focus`       | Host navigation     |
| Ask the agent to do something from an applet                              | `sendChatMessage`                   | Host chat           |
| Keep an existing applet working                                           | Its existing named server functions | Bun function worker |

For new view backends, publish operations through a `tools` export. Helpers can
stay private or live in ordinary backend modules. Scratchpad has a built-in tool
catalog. Widgets and overview keep their existing interfaces.

## CLI

Run from the workspace root, or pass `--dir <workspace>`:

```sh
moi tools view:orders
moi call view:orders archive_order '{"id":"o-1024"}'
moi call view:orders set_filter '{"status":"overdue"}'
moi tools scratchpad
moi call scratchpad read_canvas
```

Targets are either `view:<id>` or `scratchpad`. A view target uses the same ID as
`moi tab focus`. `moi tools` lists the operations for one target. `moi call`
takes the target and tool name as separate positional arguments. There is no
global catalog or execution-location flag.

Discovery returns `tools`, plus a `ui` availability field. Each tool includes its
name, description, input schema, optional annotations and `runtime` (`server` or
`ui`). The result also echoes the requested `target`.

Arguments are one JSON object, defaulting to `{}`. Results are JSON on stdout;
duration and errors go to stderr. Errors exit nonzero. The public
`call-server-fn`, `call-tool` and `scratch` commands have been removed.

## Scratchpad tools

Scratchpad exposes twelve built-in server tools for reading, drawing and editing
the shared canvas. Discover them with `moi tools scratchpad`. Most work from the
persisted canvas without an open browser. `render_canvas` needs an open
Scratchpad tab because it uses the live canvas renderer.

See [Scratchpad](moi-scratchpad.md) for the complete catalog, argument shapes and
image path behavior.

## Server tools

Declare server tools in `.moi/views/<id>.server.ts`. The object key supplies the
tool name:

```ts
// .moi/views/notes.server.ts
import type { ServerTool } from 'moi'

async function saveNote(text: string) {
  await Bun.write('./notes.txt', text)
  return { saved: true }
}

export const tools = {
  save_note: {
    description: 'Replace the saved note text',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
      additionalProperties: false
    },
    execute: ({ text }) => saveNote(text)
  } satisfies ServerTool<{ text: string }>
}
```

The worker runs with the workspace root as its working directory and the
workspace's resolved backend environment. Keep imports from `moi` type-only in
server files. Server tools can use Bun APIs, databases, files and `fetch`.

CLI and browser calls share the same warm worker and module state. Server calls
work without an open browser. They perform the real operation, including writes.

### Calling from React

```tsx
import { tools } from './notes.server'

async function save(text: string) {
  const result = await tools.save_note.execute({ text })
  return result
}
```

The bundler replaces the import with an HTTP proxy. Server implementations and
secrets stay in the worker. Browser imports expose `execute`; use discovery for
descriptions and schemas. Always await it, even if the backend handler is
synchronous. Browser tool imports must come from `views/<id>.server.ts`.

A server write does not automatically update React state. The view must reload
its data, subscribe to changes, or update local state after the call. A UI tool
can coordinate that entire interaction through the same handler as a button.

## UI tools

Call `useTool` inside the view component to expose live React state:

```tsx
import { useState } from 'react'
import { useTool } from 'moi'

export default function Orders() {
  const [status, setStatus] = useState('all')

  useTool<{ status: string }>({
    name: 'set_filter',
    description: 'Change the order status filter',
    inputSchema: {
      type: 'object',
      properties: { status: { type: 'string', enum: ['all', 'overdue'] } },
      required: ['status'],
      additionalProperties: false
    },
    execute: async ({ status }) => {
      setStatus(status)
      return { status }
    }
  })

  return <p>Current filter: {status}</p>
}
```

The hook keeps the handler tied to the latest committed render and cleans up its
registration when the effect ends. Authors do not need to memoize the descriptor
or manually register and unregister tools.

UI tools require the view to be active in one connected browser client:

- `available`: one client has the view active; discovery includes its registered tools.
- `unavailable`: no client has it active. Focus the view with
  `moi tab focus view:orders`, then discover again after it loads.
- `ambiguous`: multiple clients have the same view active. Leave it active in
  one client before discovering or calling UI tools.

Switching tabs removes UI tools, even when React retains the hidden view's state.
Leaving the workspace, rebuilding the bundle or closing the browser also ends
the relevant registrations. Calls never wake a parked view or switch tabs for
the user. Server tools remain callable without UI availability.

## How the separate agent reaches React

The agent runs a shell command. The CLI and host forward the request to the
browser holding the active view:

```text
Agent process → moi tools / moi call → host control socket → tool resolver
                                                  │
                   view server tool ──────────────┤→ Bun function worker
                   Scratchpad tool ───────────────┤→ host-owned provider
                                                  │
                   view UI tool ──────────────────┘→ browser events socket
                                                        → registered React handler
```

The browser publishes `{ workspaceId, viewId, tools }` when its active view or
registrations change and when the socket reconnects. The host reads UI discovery
metadata directly from that presence message.

The resolver reads the view's server catalog first. A declared server tool runs
in the worker; another name is forwarded to the active browser, where the local
registry checks that it exists. Duplicate server/UI names are errors when both
are known. Names must be unique across both locations within a view.

UI requests have an ID; only the selected socket can settle the result. Failure
never retries the operation in another location or another browser.

## WebMCP browser access

moi's adapter targets `document.modelContext.registerTool(tool, { signal })` from
the [WebMCP draft](https://webmachinelearning.github.io/webmcp/). It feature-detects
the API and publishes the active target's tools using their declared names:

- UI registrations invoke the same validated handler used by CLI calls.
- Server registrations use thin HTTP wrappers around the server tool endpoint.
- Aborting the registration signal removes the tool when its lifetime ends.

The server catalog is fetched for browser registration only when native WebMCP
is present. A native registration failure is reported through applet runtime
logging; the CLI's own registration and relay path remain usable.

The active Scratchpad registers its built-in server tools through the same hook.
Unmounting Scratchpad removes them. Scratchpad has no UI-authored tools in this
version.

| Agent access path                            | Browser requirement                                               |
| -------------------------------------------- | ----------------------------------------------------------------- |
| Agent runs `moi call` for a server tool      | No open browser required                                          |
| Agent runs `moi call` for a UI tool          | Connected browser with the view active; native WebMCP unnecessary |
| Browser agent discovers tools through WebMCP | Browser and agent integration supporting the targeted WebMCP API  |

The same CLI path works for an agent launched by moi or an external agent with
access to the CLI and control socket. An external agent does not automatically
require WebMCP. That requirement follows from choosing native browser tool access.
Applet authors need no separate MCP server or polyfill for the CLI workflow.

## Shared contract and cancellation

Tool names contain 1–128 ASCII letters, digits, `_`, `-` or `.`. Descriptions and
JSON object schemas are required. Inputs are checked with Ajv's JSON Schema
2020-12 validator before the handler runs. `format` validation is currently
disabled; validate domain-specific values in the handler when needed.

Arguments and results use JSON. Convert dates to ISO strings and maps or sets to
objects or arrays. Return `null` for an operation without a result. Optional
boolean annotations are `readOnlyHint`, `untrustedContentHint` and
`consequentialHint`; these describe behavior and do not enforce permissions.

Handlers receive an optional second argument containing an `AbortSignal`. Pass
`options?.signal` to cancellable work. Worker and UI relay calls have 30-second
timeouts; the CLI also bounds its connection wait. UI cleanup and connection
loss cancel pending CLI work, while HTTP calls forward their request signal to
the server worker.

Cancellation cannot undo a completed write or force arbitrary handler code to
stop. Inspect state before retrying a mutation after a timeout or disconnect.
Await the loading or persistence a result claims is complete. A React state
setter schedules a render; its return does not prove the browser has painted.

## Existing server functions and migration

Existing named async exports keep working:

```ts
// Existing .server.ts export
export async function getOrder(id: string) {
  return { id, updatedAt: new Date() }
}
```

Their React imports still compile to positional RPC calls through
`POST /api/workspaces/:id/rpc/<module>/<fn>`. The devalue transport preserves rich
values such as `Date`, `Map` and `Set`. Already-built bundles use the same route;
rebuilding does not require migrating their source.

Legacy exports are not automatically listed as tools or exposed through WebMCP.
When migrating a view:

1. Move shared implementation into private backend helpers.
2. Add tools with explicit descriptions, schemas and JSON inputs/results.
3. Keep legacy exports as thin wrappers with their original signatures and results.
4. Switch current React callers to `tools.<name>.execute(args)` and agents to `moi call`.
5. Remove wrappers once old bundles can no longer call them. A rebuild alone does
   not prove that every browser has reloaded.

For example, a legacy `getOrder(id)` can continue returning a `Date` while a new
`get_order` tool converts the shared helper's date to an ISO string.

## Building and implementation map

After editing a view or its server companion, run `moi bundle --only views`.
The companion and its imported backend dependencies participate in staleness
checks even if React never imports the companion. An actual view rebuild or
removal recycles the workspace worker; a no-op bundle preserves warm state.
This uses view builds as the reload trigger, so keep server tools alongside a
view for that workflow.

| Code                                                         | Responsibility                                                  |
| ------------------------------------------------------------ | --------------------------------------------------------------- |
| `lib/tools.ts`, `lib/tool-execution.ts`                      | Shared types, descriptors, JSON/schema validation and execution |
| `server/cli.ts`, `server/control.ts`, `server/tools.ts`      | CLI, workspace resolution and target routing                    |
| `server/scratchpad-tools.ts`                                 | Built-in Scratchpad catalog and execution                       |
| `server/view-tool-relay.ts`                                  | Browser presence, discovery and pending view UI calls           |
| `client/runtime/useServerWebMcpTools.ts`, `webmcp.ts`        | Server-tool WebMCP registration for the active target           |
| `client/features/views/useViewTools.ts`                      | Active-view presence and CLI execution                          |
| `client/features/applets/view-tools.ts`, `applet-runtime.ts` | UI registry, native registration and bundle lifetime            |
| `server/functions.ts`, `server/functions-worker.ts`          | Shared warm workers for view tools and legacy RPC               |
| `server/api.ts`                                              | JSON tool catalog/call routes and legacy RPC route              |
| `server/bundler/build-applet.ts`, `server/applets.ts`        | Browser proxies, `useTool` runtime and dependency tracking      |
| `server/moi-scaffold.ts`                                     | Applet-facing TypeScript declarations                           |

Server HTTP routes are `GET /api/workspaces/:id/tools/:target` for descriptors
and `POST /api/workspaces/:id/tools/:target/:name` for execution. The target is
the encoded canonical target, such as `view%3Aorders` or `scratchpad`. These
routes expose server tools; `moi tools` combines view server tools with live UI
presence and returns the built-in Scratchpad catalog directly.

See [self-correction](self-correction.md) for runtime checks and the
[workspace skill](../workspace/.claude/skills/moi-workspace/SKILL.md) for the
instructions supplied to applet-building agents.
