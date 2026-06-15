---
name: widgets
description: Build and modify user workspace. Workspace is the web UI user is chatting from and can be extended by writing custom "widgets" Use when the user asks to create, edit, or customize widgets, build custom UI panels, display data as cards, or asks what widgets are or how they work.
---

# Widget development

You are working inside a **moi workspace**.
Widgets are React components (`.tsx` files in `.moi/widgets/`) displayed as live cards on the browser dashboard.

## About `moi`

Treat `moi` as an external command — you cannot inspect or modify its sources. Use only the documented subcommands (`moi bundle`, `moi bundle --force`, etc.).

## Managing dependencies

Widget dependencies live in `.moi/package.json` (created by `moi init`). To add a package, add it there and run `cd .moi && bun install`. **Always use `bun`** — never `npm`, `yarn`, or `pnpm`.

`react` and `react-dom` are stubs — at runtime they're resolved from esm.sh via the browser importmap. They're listed only so editors pick up the correct types.

## File structure

| File | Purpose |
|------|---------|
| `.moi/widgets/<name>.tsx` | Widget React component (required) |
| `.moi/widgets/<name>.server.ts` | Server-side async functions the widget can call (optional) |
| `.moi/package.json` | Widget dependencies |
| `.moi/.workspace.json` | **Auto-generated. Do NOT read, edit, or `cat` this file.** |

Keep widgets **and** their `.server.ts` files together in `.moi/widgets/` — flat, no subfolders.

`.moi/.workspace.json` is owned by `moi` and rewritten on its own. Use the `moi` CLI to inspect or change anything it contains — never read or edit the file directly.

## Workflow

1. Read `.claude/skills/widgets/DESIGN.md` before creating or modifying any widget.
2. Create or edit `.moi/widgets/<name>.tsx` (and optionally `.moi/widgets/<name>.server.ts`).
3. Run `moi bundle` — the browser picks up changes automatically.
4. If the widget exports a new `config` with a changed `colSpan`/`rowSpan`, run `moi bundle --force`.

## Widget anatomy

Every widget is a default-exported React component:

```tsx
// hello.tsx
import { useState } from 'react'

export const config = { colSpan: 1, rowSpan: 1 } as const

export default function Hello() {
  const [n, setN] = useState(0)
  return (
    <div className="flex flex-col w-full h-full p-4 bg-violet-600">
      <span className="text-xs text-foreground/70">Counter</span>
      <span className="text-2xl font-bold font-mono tabular-nums leading-none mt-4">{n}</span>
      <button
        onClick={() => setN(n + 1)}
        className="mt-auto text-xs text-foreground/70 text-left"
      >
        +1
      </button>
    </div>
  )
}
```

Key rules:
- The widget root is content-only: a plain `w-full h-full` rectangle. Never apply card chrome — no `rounded-*`, `shadow-*`, outer `border`, or background that mimics a card surface — the host dashboard owns the shell, spacing, radius, border, and elevation.
- Tailwind is available. Never use `style={{}}` or custom CSS.
- Import only from the same folder or `package.json` deps. No `@/` path aliases.
- For conditional classes, define a local `cx()` helper (widgets can't import from the project root):

```tsx
function cx(...classes: (string | false | undefined | null)[]) {
  return classes.filter(Boolean).join(' ')
}
```

## Server functions (optional)

Create a `.server.ts` alongside the widget. Export named `async function`s only — no `const`, sync, or class. They run on the Bun server with full access to `process.env` and the filesystem (including files outside `.moi/`).

**Working directory:** server functions run with `cwd = <workspace root>` (the parent of `.moi/` — same directory the agent operates in). Use plain relative paths to read workspace files:

```ts
// ✓ workspace-root files: just use relative paths
new Database('local.db', { readonly: true })
await Bun.file('./data/notes.json').text()
```

For files inside `.moi/widgets/` itself, anchor on the file's own location:

```ts
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const here = dirname(fileURLToPath(import.meta.url)) // resolves to .moi/widgets/
const fixturePath = join(here, 'fixture.json')
```

```ts
// hello.server.ts
export async function fetchData(): Promise<{ value: number }> {
  // can read files, call APIs, query DBs, etc.
  return { value: 42 }
}
```

Call them from the widget exactly like normal async functions — arguments and return values are auto-serialized (supports `Date`, `Map`, `Set`, etc.).

Standard data-fetching pattern for a widget with a server function:

```tsx
export default function MyWidget() {
  const [data, setData] = useState<DataType | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const result = await fetchData()
      setData(result)
      setError(null)
    } catch {
      setError('Could not load data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <Skeleton />
  if (error || !data) return <ErrorState error={error} onRetry={load} />
  return <Content data={data} />
}
```

Always handle three states: loading → skeleton, error → error state with retry, success → content.

## Commands

- `moi bundle` — compile changed widgets
- `moi bundle --force` — rebuild all widgets (use after changing `config`)
- `moi refresh` — re-fetch widget data without rebuilding (use after you mutated data the widgets read — DB rows, files, external API records — so the displayed values catch up)
- `moi theme --font=<key>` — change font theme (omit `--font` to list options)
- `moi theme --color=<key>` — change color preset (omit `--color` to list options)

## Rules

- Never read or modify files outside this workspace directory.
- Do not start, stop, or inspect the web server — it is managed externally.
- Only use `moi` commands listed above plus `bun` / `bun install` for dependencies — no `node`, `npm`, `yarn`, `pnpm`, or other server commands.
