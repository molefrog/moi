---
name: moi-workspace
description: The moi workspace — the web UI the user chats from, extended with agent-authored applets (widgets, views) plus theme & config. Read this FIRST in two cases. (a) A message carries hidden <moi>…</moi> meta tags: it was fired from a moi workspace, so you are running inside one even if nothing else says so. (b) The user uses moi vocab — workspace, applet, widget, view, scratchpad, dashboard, or a `moi` command — or asks to build, edit, customize, or theme the workspace UI or its layout.
---

# Workspace

You are working inside a **moi workspace**. It is a web UI that the user communicates with you
through. It has regular chat (this one), as well as custom UI elements that you can define, write,
and change to tailor the workspace to user needs. It starts with a simple chat, but evolves into a
personal app equipped with a copilot (you). Workspace is a two-way communication: you can build the
UI, user can interact with it, send feedback, modify state, then talk back to you. It's a shared UI
that you and user work together in.

Workspace features/pages:

- "Widgets" - small reusable full-stack components displayed on the widgets page (dashboard). For
  overview, quick info, status or quick actions.
- "Scratchpad" - a shared low-fi canvas for prototyping, working on ideas together, visualising
  concepts. Read `SCRATCHPAD.md` before building on or modifying it.
- "Views" - full-stack embedded apps for bigger work, consume more space, live in their own tab.

User can switch between these, but can access the chat (this conversation and other threads) from
**any place in the app** (copilot mode), or on a dedicated page.

Workspace settings and customisation:

- "Config": set name, icon, change other settings. User can modify these from the UI and you can do
  it via the `moi config` command. Call `moi config --help` for further docs.
- "Theme": customize workspace fonts, colors, visual appearance. User can modify these from the UI
  and you can do it via the `moi theme` command. Call `moi theme --help` for further docs.

# Glossary

"Workspace" or "Moi Workspace" — the web UI that the user works in, talks/collaborates with you,
sees and interacts with "Applets".

"Project" - the primary working folder _you_ (as an agent) work in. Managed by your harness; moi
does not have a clear definition, but assumes this is the root folder in which it stores its state
files.

"Threads" — a workspace is driven through agent conversations (this chat is one). Depending on your
harness (Claude Code, openclaw, others differ in the details) there can be **multiple threads**, but
they all share **one** workspace **and one Project folder** — the same filesystem, the same `.moi`
folder, applets, config, and theme. Anything you build is visible to every thread, and another thread
may have changed the workspace or the Project files since you last looked. Treat `.moi` and the
Project folder as shared state, not yours alone.

"Applets" are standalone full-stack components that _you_ write and maintain. They extend the
Workspace UI.

"Applet Type" (one of)

- "Widgets" (live in the dashboard page)
- "Views" are custom full-size pages that user can switch between.

"Moi CLI" — the globally installed `moi` command that you use to build applets, customize, and send
events to "Workspace".

# Where moi lives in filesystem

Source of truth - `.moi` folder in the root of "Project" folder. Contains source code of all
Applets, bundled code, settings, etc. Can be committed to version control. Folder is partially
initialised when Workspace starts, you have full ownership of it.

You _do have_ access to the files in the root of Project — you can reference and load them from the
"Applets" and elsewhere.

Folder structure:

```
my-agent-folder/
  .moi/
    widgets/                  <- source code of Widget React components
      total-users.tsx
      rps-chart.tsx
      server-metrics.server.ts <- Server-side async functions the widget can call (optional)
      ...
    views/
      users.tsx
      crm.tsx
      users-api.server.ts     <- Server-side async functions the view can call (optional)
      ...
    package.json              <- Applet dependencies that you manage
    .workspace.json           <- Auto-generated. Do NOT read, edit, or `cat` this file. Use Moi CLI instead.
    .scratchpad.json          <- Scratchpad canvas snapshot. Internal — inspect only via `moi scratch read`, never open it.
```

# Build environment

- Bun is the required dependency of moi, so it must be installed
- For package management **always** use bun
- package.json is scaffolded during init. You are free to install/remove/do whatever with packages.
- if packages aren't installed, it's your responsibility to call `bun install`
- `react` and `react-dom` are stubs — they're provided by moi at runtime via the browser importmap.
  They're listed only so editors pick up the correct types.
- `moi bundle` runs **Bun's bundler**, so standard Bun imports, loaders, and tricks apply (JSON,
  text, etc.) — see the Bun docs. Only the moi-specific imports (covered under **Developing
  Applets**) differ.

# `moi` CLI

Treat `moi` as an external command — you cannot inspect or modify its sources. Use only the
documented subcommands (`moi bundle`, `moi bundle --force`, etc.). Call `moi help` for
documentation. Run all `moi` commands from the **project root** — the folder that contains `.moi/`,
never from inside `.moi/` itself. You don't pass paths; moi resolves the workspace from where it's run.

- `moi bundle` — compile changed applets
- `moi bundle --force` — rebuild all applets (use after changing `config`)
- `moi refresh` — re-fetch widget/view data without rebuilding (use after you mutated data the
  widgets read — DB rows, files, external API records — so the displayed values catch up)
- `moi theme --font=<key>` — change font theme (omit `--font` to list options)
- `moi theme --color=<key>` — change color preset (omit `--color` to list options)
- `moi config` — set the workspace name & icon (`moi config --help` for usage)
- `moi env` — list available env keys and where they come from (never values);
  `moi env exec -- <cmd>` runs a command with the workspace env (see Environment & secrets)
- `moi skill` — show installed vs bundled skill versions; `moi skill update` to refresh

For more options, commands, use `moi help`.

# Critical constraints when interacting with moi

- Never read or modify files outside the `.moi` directory, unless the user explicitly asks. If you
  do need it -> ask for permission.
- Do **not** start, stop, or inspect the Workspace web server — it is managed externally.

# Developing Applets

Every applet — a **Widget** or a **View** — is a default-exported React component in
`.moi/<type>/<name>.tsx`, optionally paired with a `<name>.server.ts`. `moi bundle` compiles each
into a live module the browser loads (edits hot-reload). Read `DESIGN.md` / `VIEW-DESIGN.md` first.
Write normal React + Tailwind — below is only what's **moi-specific**.

## Anatomy

```tsx
// .moi/widgets/hello.tsx
import { useEffect, useState } from 'react'
import { getGreeting } from './hello.server' // optional server fn — see below

// Optional config — fields are per type (see Widgets / Views below). requiredEnv is shared.
export const config = { requiredEnv: ['API_KEY'] }

export default function Hello() {
  const [msg, setMsg] = useState('')
  useEffect(() => {
    getGreeting().then(setMsg) // call server fns like any async function
  }, [])
  return <div className="h-full w-full p-4">{msg}</div>
}
```

Imports resolve from the same folder or `.moi/package.json` deps only — no `@/` aliases.

## Server functions — `<name>.server.ts`

Export named `async function`s (only — no `const`, sync, or class) and call them from the component
like ordinary async functions; arguments and return values are auto-serialized (`Date`, `Map`,
`Set`, … work). They run on the Bun server with `process.env` and full filesystem access, at
`cwd = <workspace root>` (the parent of `.moi/`, where you operate) — so workspace files are plain
relative paths:

```ts
// hello.server.ts — read files, call APIs, query DBs…
export async function getGreeting(): Promise<string> {
  return (await Bun.file('./notes.md').text()).split('\n')[0]
}
```

The component fetches on mount; after you change underlying data a server fn reads, run
`moi refresh` to re-pull it without a rebuild.

It's plain Bun — every Bun API is available with no setup: `bun:sqlite`, `Bun.redis`, `Bun.s3`,
`Bun.file`, `fetch`, …

## Workspace files & assets

- **Bundled asset** — `import logo from './logo.png'` resolves to a URL at build time (images &
  fonts: `png jpg gif svg webp avif ico woff woff2 ttf otf`). For small art shipped beside the
  `.tsx`.
- **Workspace file** — stream a file from the workspace via `fileUrl` from the **`moi`** package:

  ```tsx
  import { fileUrl } from 'moi'
  ;<video src={fileUrl('clips/intro.mp4')} controls />
  ```

  `fileUrl(path)` maps a **workspace-root-relative** path to a streaming URL (HTTP range — media
  seeks, nothing is base64-inlined). Media/asset extensions only; `.env`, source, JSON and dotfiles
  are rejected. The path is plain data, so a `.server.ts` can return it and the component renders
  `fileUrl(clip.file)`.

Rule of thumb: small own art → `import`; structured data → `.server.ts` returns it; large/streamable
media → `.server.ts` returns the **path**, render with `fileUrl()`.

## Environment & secrets

Each workspace has an effective env: keys from the project's `.env` / `.env.local` (when
inheritance is enabled in settings) plus **custom secrets** the user manages in the workspace env
settings. moi injects this env into:

- applet server functions — read it as `process.env` inside `.server.ts`
- any command run via `moi env exec -- <cmd>`
- your own shell (Bash tool) — but only in some harnesses (e.g. Claude Code). Don't assume it:
  verify the key is visible first, or just use `moi env exec`, which works everywhere.

Rules:
- **Check before you assume.** When a task needs a key or token — an API pull, a widget calling a
  service — run `moi env` first. It lists key names with their source (`.env` / custom) and flags
  declared `requiredEnv` keys that are missing. Values are never shown.
- **Key present** → say which key you'll use and where it's from ("using `NOTION_TOKEN` from
  `.env`") and proceed. To run a script or one-off command with the workspace env, use
  `moi env exec -- bun script.ts` — it also picks up values changed after your session started.
- **Key missing** → never invent or hardcode a value, and don't edit `.env` yourself. Tell the user
  the exact key name to add in the workspace env settings. Still build and wire the applet: declare
  the key in `config.requiredEnv` and handle its absence, so it works the moment the user sets it.
  If the user pastes a value in chat, store it with `moi env set KEY=value`
  (`moi env unset KEY` removes it).
- **Never print secret values** — not in chat, not in logs. Refer to keys by name only.

`process.env` is readable **only** inside `.server.ts` (the `.tsx` runs in the browser) — keep API
keys there. Either source may be absent, so always handle a missing key. List expected keys in
`config.requiredEnv` — advisory only (it surfaces a hint in the UI and `moi env`; it's never
enforced).

```ts
// forecast.server.ts
export async function getForecast(city: string) {
  const key = process.env.WEATHER_API_KEY // always current — env changes respawn the worker
  if (!key) return { error: 'Add WEATHER_API_KEY to your env' }
  const res = await fetch(`https://api.example.com/forecast?city=${encodeURIComponent(city)}`, {
    headers: { Authorization: `Bearer ${key}` }
  })
  if (!res.ok) return { error: `Weather API error ${res.status}` }
  return { data: await res.json() }
}
```

# Widgets

Live cards on the dashboard grid — many visible at once. `config` sets the grid footprint:

```ts
export const config = {
  colSpan: 2, // columns the card spans — 1–4
  rowSpan: 1, // rows the card spans — 1–4
  requiredEnv: ['API_KEY'] // optional env-key hints (advisory; see Environment & secrets)
} as const
```

Render **content only**: a plain `h-full w-full` region with no card chrome (`rounded-*`,
`shadow-*`, outer `border`, or a card-like background) — the dashboard owns the shell, spacing, and
elevation. Changing `colSpan`/`rowSpan` needs `moi bundle --force`. See `DESIGN.md`.

Typical loop: check/`bun install` deps → write `.moi/widgets/<name>.tsx` → `moi bundle` → it appears
on the dashboard → change it and re-`bundle`, or `moi refresh` after mutating data, or any other `moi`
command as needed. Views work the same way (`.moi/views/<name>.tsx`, appears as a nav tab).

# Views

Full-screen apps, one per nav tab — the user switches tabs; there is no routing inside a view.

```ts
export const config = {
  title: 'User CRM', // nav-tab label — defaults to the file name
  requiredEnv: ['CRM_API_KEY'] // optional env-key hints (advisory; see Environment & secrets)
} as const
```

The inverse of a widget: a view **owns its whole page** — its own `h-full w-full` layout, scrolling
(`overflow-auto`), padding, and chrome. Build it to read like an app screen. See `VIEW-DESIGN.md`.

# Keeping this skill current

This skill is installed with moi (via the CLI or the UI) and can fall behind when the moi CLI updates.

- **You'll know** — `moi` commands warn you when this skill is behind.
- **To update** — run `moi skill update`. Never mid-task: finish first, or do it at the end.
- **Re-read after updating** — `moi skill update` rewrites `SKILL.md` and its companion docs
  (`DESIGN.md`, `VIEW-DESIGN.md`, `SCRATCHPAD.md`) on disk, so the copy already in your context is
  stale. Re-read this `SKILL.md` before you rely on it again — don't act on the old version.
- **Then** — if you updated, mention it.

<!-- moi skill version marker — read by `moi skill` to detect drift; do not edit by hand -->
<moi-skill version="0.5.0" />
