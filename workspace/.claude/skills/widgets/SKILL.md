---
name: widgets
description: Build and modify user workspace. Workspace is the web UI user is chatting from and can be extended by writing custom "widgets" Use when the user asks to create, edit, or customize widgets, build custom UI panels, display data as cards, or asks what widgets are or how they work.
---

# Widget development

You are working inside a **moi workspace**.
Widgets are React components (`.tsx` files in `.widgets/`) displayed as live cards on the browser dashboard.

## About `moi`

Treat `moi` as an external command — you cannot inspect or modify its sources. Use only the documented subcommands (`moi bundle`, `moi bundle --force`, etc.).

## Managing dependencies

You are allowed to add packages to `.widgets/package.json` and run `bun install` whenever it's needed (e.g. after editing `package.json`, or before bundling if `node_modules/` looks stale). **Always use `bun`** — never `npm`, `yarn`, or `pnpm`.

## First-time setup

If `.widgets/` does not exist yet, create it and install dependencies:

1. Create `.widgets/package.json`:

```json
{
  "name": "widgets",
  "private": true,
  "dependencies": {
    "@tabler/icons-react": "^3.40.0",
    "tailwindcss": "^4.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0"
  }
}
```

`react` and `react-dom` are stubs — at runtime they're resolved from esm.sh via the browser importmap. They're listed here only so editors pick up the correct types.

2. Run `cd .widgets && bun install`

## File structure

| File | Purpose |
|------|---------|
| `.widgets/<name>.tsx` | Widget React component (required) |
| `.widgets/<name>.server.ts` | Server-side async functions the widget can call (optional) |

## Workflow

1. Read `.claude/skills/widgets/DESIGN.md` before creating or modifying any widget.
2. Create or edit `.widgets/<name>.tsx` (and optionally `.widgets/<name>.server.ts`).
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
- Use `w-full h-full` on the root element to fill the card.
- Tailwind is available. Never use `style={{}}` or custom CSS.
- Import only from the same folder or `package.json` deps. No `@/` path aliases.
- For conditional classes, define a local `cx()` helper (widgets can't import from the project root):

```tsx
function cx(...classes: (string | false | undefined | null)[]) {
  return classes.filter(Boolean).join(' ')
}
```

## Server functions (optional)

Create a `.server.ts` alongside the widget. Export named `async function`s only — no `const`, sync, or class. They run on the Bun server with full access to `process.env` and the filesystem (including files outside `.widgets/`).

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
- `moi theme --font=<key>` — change font theme (omit `--font` to list options)
- `moi theme --color=<key>` — change color preset (omit `--color` to list options)

## Rules

- Never read or modify files outside this workspace directory.
- Do not start, stop, or inspect the web server — it is managed externally.
- Only use `moi` commands listed above plus `bun` / `bun install` for dependencies — no `node`, `npm`, `yarn`, `pnpm`, or other server commands.
