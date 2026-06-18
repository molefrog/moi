---
name: widgets
description: Build and modify user workspace. Workspace is the web UI user is chatting from and can be extended by writing custom "widgets" Use when the user asks to create, edit, or customize widgets, build custom UI panels, display data as cards, or asks what widgets are or how they work.
---

# Workspace
You are working inside a **moi workspace**. It is a web-ui that the user is communicating to you to.
It has regular chat, as well as custom UI elements that you can define, write, change to customize
to workspace to user needs. It starts with a simple chat, but evolves into a personal app equipped with
a copilot (you). Workspace is a two way communication: you can build the UI, user can interact with it,
send feedback, modify state, then talk back to you. It's a shared UI that you and user work together in.

Workspace structure:
- "Widgets" - small reusable full-stack components displayed on the grid, kinda like dashboard.
- "Scratchpad" - a shared low-fi canvas for prototyping, working on idea together, visualising
- "Views" - full-stack embedded apps for bigger work, consume more space. 

User can switch between these, but can access the chat (this conversation and other threads) from 
any place in the app.

Workspace settings and customisation:
- "Config": set name, icon, change other settings. User can modify these from the UI and you can do it 
  via the `moi config` command. Call `moi config --help` for futher docs.
- "Theme": customize workspace fonts, colors, visual appearance. User can modify these from the UI and you can do it 
  via the `moi theme` command. Call `moi theme --help` for futher docs.


## Widgets

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

## Assets & workspace files

Two ways to pull non-code resources into a widget or view, beyond `.server.ts` data:

**Bundled assets** — `import` an image or font that ships *with* the component:

```tsx
import logo from './logo.png' // resolves to a URL string at build time
;<img src={logo} alt="logo" />
```

Put the file next to the `.tsx` (flat in `.moi/widgets/` or `.moi/views/`). Supported:
`png jpg jpeg gif svg webp avif ico woff woff2 ttf otf`. Each is content-hashed and
served beside the bundle — use this for small, component-owned art. Don't `import`
large media (a video, a big audio file); stream it instead ↓.

**Workspace files** — stream a file that lives in the workspace (video, audio, large
images) with `fileUrl` from the `moi` module:

```tsx
import { fileUrl } from 'moi'
;<video src={fileUrl('clips/001_intro.mp4')} controls />
```

`fileUrl(path)` takes a **workspace-root-relative** path (the same root your
`.server.ts` reads from) and returns a streaming URL with HTTP range support, so
`<video>`/`<audio>` seeking works and nothing gets base64-inlined. Only media/asset
extensions are served; `.env`, `.json`, source, and dotfiles are rejected. The path is
just data — a `.server.ts` can compute it and hand it back (e.g. `listClips()` returns
`{ file: 'clips/001.mp4' }`), then the component renders `fileUrl(clip.file)`.

Rule of thumb: component-owned small asset → `import`; structured data → `.server.ts`
returns the value; large/streamable workspace media → `.server.ts` returns the **path**,
render with `fileUrl()`.

## Environment variables (server functions only)

Read config and secrets from `process.env` inside `.server.ts` — it holds all env vars of the process running the function. This is **server-only**: the widget `.tsx` runs in the browser and never sees these values, so keep API keys in `.server.ts`.

```ts
// tts.server.ts
export async function speak(text: string) {
  const key = process.env.ELEVENLABS_API_KEY
  if (!key) throw new Error('ELEVENLABS_API_KEY not set for this workspace')
  // …call the API with `key`
}
```

moi injects per-workspace values from two sources: **custom secrets** the user sets in moi's env settings, and the workspace's **`.env` files** the user can optionally inherit. (Both are also subject to moi's settings, e.g. inheritance can be turned off — so treat any key as possibly missing.)

In the **widget's `config`**, optionally declare the keys it needs via `requiredEnv`. This is advisory — moi's UI uses it to tell the user which keys to set. It is **not** enforced: you can read any var that's defined even if undeclared, and a declared-but-unset key is just `undefined`, so always handle the missing case yourself.

```ts
// in the widget's .tsx
export const config = {
  colSpan: 2,
  rowSpan: 1,
  requiredEnv: ['ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE_ID'] // optional, advisory
} as const
```

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
