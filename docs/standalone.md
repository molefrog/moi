# Standalone distribution

Stable releases can ship in three forms. They all run the same code; pick by
what you have installed:

| Channel        | Install                                                                                         | Update       | Needs     |
| -------------- | ----------------------------------------------------------------------------------------------- | ------------ | --------- |
| Standalone CLI | `curl -fsSL …/packaging/install.sh \| sh`                                                       | `moi update` | curl, tar |
| Desktop app    | `.dmg` / `.AppImage` from the [latest release](https://github.com/molefrog/moi/releases/latest) | `moi update` | nothing   |
| npm            | `bun i -g moi-computer`                                                                         | `moi update` | Bun ≥ 1.3 |

Use the standalone CLI or desktop channels only when the latest release lists
the matching `moi-standalone-*` asset and checksum. Releases from before the
standalone distribution was introduced do not contain them; the installer
fails without changing the machine when either file is absent.

## How the standalone install works

The standalone build is a self-contained runtime tree — a pinned Bun binary
plus the published package with its production dependencies preinstalled:

```
~/.moi/
├── bin/moi                  exec shim at a stable path
└── runtime/
    ├── current → 0.7.0      symlink, flipped atomically on update
    └── 0.7.0/
        ├── bun              exact Bun this release was built and tested with
        └── app/             package + node_modules (agent SDK, tailwind, …)
```

The `moi` command is a small shell shim that execs the pinned Bun with the real
CLI. Every runtime path — the agent SDK spawning its CLI, applet
bundling with Tailwind, function workers, sharp — behaves exactly like a
normal `bun i -g` install, because from the server's perspective it is one.

`moi update` downloads a strictly newer stable release for your platform,
requires and verifies its SHA-256, validates the extracted runtime, and flips
the `current` symlink. Install, update, uninstall, and desktop provisioning
share a cross-process lock. The previous version is kept for instant rollback
(re-point the symlink); anything older is pruned. `moi uninstall` removes `~/.moi`
(`--data` also removes the workspace registry and settings; workspace files
are never touched). If the desktop app is still installed, its next launch
re-provisions `~/.moi` from its bundled runtime — delete the app too for a
full removal.

Set `MOI_HOME` to install somewhere other than `~/.moi`.

## The desktop app

The desktop app (`desktop/`) is a thin Tauri shell around the same runtime:
it extracts the bundled runtime into `~/.moi` on first launch (which also
installs the `moi` command), starts the user-level `moi service` if none is
running, and opens a webview at `localhost:13337`. The service keeps moi
available after the window closes. If service installation is unavailable, the
app falls back to an app-owned server that stops on quit. An existing moi server
is reused; an unrelated listener on that port is reported as a collision. See
[desktop/README.md](../desktop/README.md).

## Release engineering

Per-platform tarballs are built by `scripts/build-standalone.ts` on matching
CI runners (`.github/workflows/release.yml`) — `node_modules` is
platform-specific (sharp, Tailwind oxide, the agent SDK's native CLI), so
there is no cross-compilation. A stable tag must exactly match the package
version. CI verifies all runtime and desktop artifacts, uploads them to a draft,
then publishes one complete release:

- `moi-standalone-<version>-<platform>.tar.gz` (+ `.sha256`) for
  darwin-arm64, darwin-x64, linux-x64, linux-arm64
- `moi_<version>_….dmg` / `.AppImage` / `.deb` desktop bundles

To build any of it locally after pulling changes (no CI needed):
`bun scripts/build-standalone.ts` for the runtime tarball,
`bun scripts/build-desktop.ts` for the desktop bundle.

macOS artifacts are ad-hoc signed, not notarized. `curl` downloads carry no
quarantine attribute and run as-is; a browser-downloaded `.dmg` needs
right-click → Open (or `xattr -d com.apple.quarantine /Applications/moi.app`)
on first launch.
