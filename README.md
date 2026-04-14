# moi

Local AI workspace powered by Claude Agent SDK, Bun, React, and Tailwind.

## Setup

Install dependencies:

```sh
bun install
```

Link the `moi` binary globally so it's available in any terminal session — and so the agent can call it from any workspace directory:

```sh
bun link
```

This registers the package from `package.json#bin` and makes `moi` available on your `PATH`.

## Usage

Initialize a workspace directory:

```sh
moi init [dir]          # scaffold .claude/rules/ and .widgets/ into dir (default: .)
moi init [dir] --web    # also start the server and open the browser
```

Start the web server:

```sh
moi start               # http://localhost:3000
moi start --hot         # with hot reload (dev mode)
```

Other commands:

```sh
moi bundle [dir]        # rebuild changed widgets
moi theme [dir]         # show or set font theme (--font=<key>)
moi status              # show server status and registered workspaces
```

## Development

```sh
bun run dev             # start dev server with hot reload on port 3000
```
