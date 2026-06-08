# moi

Local AI workspace powered by the Claude Agent SDK, Bun, React, and Tailwind.

> Published on npm as **`moi-computer`**; the installed command is **`moi`**.

> **Requires [Bun](https://bun.sh).** moi is Bun-only — it uses `Bun.serve`, the
> Bun bundler, and other Bun APIs. Running it under Node prints an install hint
> and exits.

## Install

Install globally so the `moi` command is always on your PATH — the agent calls
`moi` from your workspaces, so this is the recommended setup:

```sh
bun i -g moi-computer
moi start
```

If you don't have Bun yet:

```sh
curl -fsSL https://bun.sh/install | bash
```

You can also run it once without installing:

```sh
bunx moi-computer init [dir]
```

`bunx` works for a single invocation but leaves no persistent `moi` command, so
it prints a reminder to install globally.

## Usage

Initialize a workspace directory:

```sh
moi init [dir]          # scaffold .claude/skills into dir (default: .)
moi init [dir] --web    # also start the server and open the browser
```

Start the web server:

```sh
moi start               # http://localhost:3000
moi start --port=4000   # custom port
```

Other commands:

```sh
moi bundle [dir]        # rebuild changed widgets
moi refresh             # refresh widget data without rebuilding
moi theme [dir]         # show or set font/color themes (--font=<key> --color=<key>)
moi status              # show server status and registered workspaces
moi openclaw init       # install moi skills into an OpenClaw agent workspace
```

## Development (from source)

```sh
bun install
bun run dev             # watch-and-restart dev server on port 3000
```

`bun run dev` starts a supervisor that hot-reloads the frontend in place and
full-restarts the server on changes to `server/` or `lib/`. Do not run the
server with `bun --hot` — see `CLAUDE.md` for why.
