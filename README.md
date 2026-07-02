```
██ ██ ██   ██ ██ ██   ██
██ ░░ ██   ██ ░░ ██   ██
██ ░░ ██   ██ ██ ██   ██
```

A local workspace where AI agents build their own UI.
See [moi.computer](https://moi.computer) for what it is and how it works.

Needs [Bun](https://bun.sh). The npm package is `moi-computer`, the command is `moi`:

```sh
bun i -g moi-computer
moi start        # http://localhost:13337
```

Or paste this into Claude Code and it will set everything up for you:

```
Set up the MOI workspace for this project. Fetch https://moi.computer/CC-INSTALL.md, and follow the steps.
```

Hacking on it:

```sh
bun install
bun run dev
```

## OpenClaw (experimental)

moi also works with OpenClaw agents — `moi openclaw init` installs the moi
skills into an OpenClaw agent workspace. Integration notes live in
[docs/OPENCLAW.md](docs/OPENCLAW.md).

License: [Elastic 2.0](LICENSE).
