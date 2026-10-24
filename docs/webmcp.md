# Server tools over WebMCP

A view can publish backend operations to browser agents through WebMCP. Declare a
`tools` object in `.moi/views/<id>.server.ts`. Moi registers those tools while that
view is active. Switching views or workspaces removes the previous catalog.
Handlers run in the workspace's existing server-function worker. Only descriptions,
JSON schemas and results cross into the browser.

This first pass supports server tools. It does not add frontend `useTool`, built-in
Scratchpad tools, bot accounts or per-bot authorization. Tools use the same access
to the workspace as existing applet RPC. An account or identity system can be built
separately; a caller-supplied bot name is just a label.

## Try it

Start this checkout with `bun run dev`. In a workspace, create
`.moi/views/hello.server.ts`:

```ts
import type { ServerTool } from 'moi'

export const tools = {
  hello: {
    description: 'Introduce your agent to this workspace',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', minLength: 1 } },
      required: ['name'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true },
    execute: ({ name }) => ({ message: `Hello, ${name}!` })
  } satisfies ServerTool<{ name: string }>
}
```

Add `.moi/views/hello.tsx` so the view appears in the browser:

```tsx
export const config = { title: 'Agent playground' }

export default function Hello() {
  return <p className="p-4">Agents can call the hello tool while this view is open.</p>
}
```

From the workspace root:

```sh
moi bundle --only views
moi tools view:hello
moi call view:hello hello '{"name":"Ada"}'
moi navigate moi:/views/hello
```

Use the CLI from this checkout if your global `moi` points at another installation:
`bun /absolute/path/to/moi/server/cli.ts tools view:hello --dir /path/to/workspace`.
The same substitution works for `bundle`, `call` and `navigate`.

In a WebMCP-capable browser, an agent visiting that view discovers `hello` and calls
it with `{ "name": "Ada" }`. Native registration uses
[`document.modelContext.registerTool`](https://developer.chrome.com/docs/ai/webmcp/imperative-api).
No polyfill is installed: browsers without that API still run Moi normally, and
CLI/HTTP tool calls work without browser support.

For a browser-side smoke test, current WebMCP implementations support:

```js
const tools = await document.modelContext.getTools()
const hello = tools.find(tool => tool.name === 'hello')
await document.modelContext.executeTool(hello, { name: 'Ada' })
```

## Call from the view

React can import the same tools. The bundler replaces the import with HTTP proxies;
the implementation stays on the server:

```tsx
import { tools } from './hello.server'

const result = await tools.hello.execute({ name: 'Ada' })
```

Always await `execute`, even when the backend handler is synchronous. Browser
proxies expose `execute` only; use discovery for schemas and descriptions. A server
mutation does not automatically refresh React state. Use your applet's existing
refresh/subscription mechanism, or `moi refresh --only views`.

Existing named async exports and their positional RPC calls keep working, including
rich values such as `Date`, `Map` and `Set`. They are not automatically published as
tools. Keep shared logic in private helpers and wrap only the operations agents
should discover. A legacy async function named `tools` also keeps working.

## Execution and refresh

- Tool names contain letters, digits, `_`, `-` or `.`, up to 128 characters.
- Arguments must be JSON objects and match the declared JSON Schema. Ajv validates
  schemas and arguments on the server. Format annotations such as `date-time` are
  informational; use patterns or handler validation when you need enforcement.
- Results must be JSON values. Convert dates to ISO strings and maps/sets to plain
  objects or arrays. `undefined`, non-finite numbers and cyclic results are rejected.
- Optional annotations are `readOnlyHint`, `untrustedContentHint` and
  `consequentialHint`; each is a boolean.
- Handlers may accept a second `{ signal }` argument for cancellation. Pass it to
  fetches or other cancellable work. Calls time out after 30 seconds. Cancellation
  cannot roll back a mutation that already happened; callers must not retry blindly.
- CLI and HTTP calls need no active view or frontend file. They use the same warm
  worker as applet RPC. Run `moi bundle --only views` after edits to a view or its
  companion. Rebuilds track the companion and its local imports even when the view
  never imports it. For a server-only module without a view, restart Moi after edits.
- Browser registration refreshes after view rebuilds, environment changes and
  workspace-event reconnections. Navigating away aborts registration, while an
  already running invocation keeps its own cancellation signal.

## HTTP API

Both endpoints resolve the workspace through the existing workspace middleware:

- `GET /api/workspaces/:id/tools/view%3Ahello` returns the descriptor array.
- `POST /api/workspaces/:id/tools/view%3Ahello/hello` takes a JSON object and returns
  the handler's JSON result. Set `Content-Type: application/json`.

Discovery does not cache responses. Unknown workspaces return 404; malformed JSON
returns 400. Worker and validation errors return a non-success response with a
plain-text explanation. Failed tool calls are never retried automatically.
