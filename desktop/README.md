# moi desktop

A thin Tauri v2 shell around the standalone moi runtime. It contains no
product code: on launch it provisions the same `~/.moi` runtime tree the CLI
installer uses (extracting the bundled `moi-runtime.tar.gz` on first launch,
which also puts the `moi` command in `~/.moi/bin`), starts the `moi service` if
none is running, and opens a webview at `http://localhost:13337`.

All product iteration happens in `client/` and `server/` — a feature shipped
there appears in this app with no changes here. If a moi server is already
running (for example started with `moi start`), the app attaches to it. The
service stays available after the window closes; when service installation is
unavailable, the app falls back to an app-owned server that stops on quit.

`moi update` updates the shared runtime for both the CLI and this app.

## Visual ownership

The normal desktop window is the existing React client served by moi; the shell
does not maintain a separate application UI. `desktop/ui/index.html` is only a
temporary boot and error surface shown while the local server starts. Its build
imports the main client's Tailwind theme directly.

Desktop branding comes from `client/assets/favicon.png`. The boot page bundles
that canonical asset, and the committed platform icon set under
`src-tauri/icons/` is generated from it with
`bun scripts/build-desktop-icons.ts`. Do not add a desktop-only logo, loading
animation, palette, or type system. Product loading states after the server
starts remain owned by the client (`HomeLogo` and `LedLogo`).

## Build

Requires Rust (`rustup` or `brew install rust`) plus the platform WebView
(preinstalled on macOS; `webkit2gtk` on Linux).

```sh
bun scripts/build-desktop.ts
```

This builds the standalone runtime tarball for the current platform (or
reuses `dist-standalone/` / a `--runtime <tar.gz>` argument), stages it as the
Tauri resource, and runs `tauri build`. Bundles land in
`desktop/src-tauri/target/release/bundle/`.

## macOS Gatekeeper

Release builds are ad-hoc signed, not notarized (no Apple Developer account).
A `.dmg` downloaded with a browser is quarantined; first launch needs either
right-click → Open, or:

```sh
xattr -d com.apple.quarantine /Applications/moi.app
```

Installs via the `curl` installer are not quarantined and launch without this.
