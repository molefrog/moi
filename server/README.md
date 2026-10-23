# Server structure

The server runs on Bun. Code is grouped by the feature it owns. HTTP routes,
WebSocket handlers, and CLI commands call the same feature modules.

## Where code belongs

| Location           | Owns                                                                                                                                                                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api/`             | Hono HTTP routes, request validation, workspace lookup middleware, and API tests. `index.ts` assembles and defines the main routes; `harnesses.ts` defines login routes.                                                                |
| `cli/commands/`    | One module per top-level CLI command, with its subcommands and private helpers.                                                                                                                                                         |
| `cli/`             | Command registration, help, CLI access gates, terminal formatting, control requests, and server launching.                                                                                                                              |
| `workspaces/`      | Workspace discovery and registration, creation/import, `.moi/` scaffolding, layout, tabs, theme, icons, file previews, and environment settings.                                                                                        |
| `sessions/`        | Moi's session metadata, selection and pin state, archiving, ID renames, message attachments, and pending-view chat handoffs. Provider-owned history stays in the harnesses.                                                             |
| `workspace-state/` | Per-workspace `state.json` storage: one writer per workspace, transactions, atomic writes, lock timeout, a revision and a `state:changed` event per change, re-adoption of a removed workspace's id, and the one-time legacy migration. |
| `applets/`         | View/widget manifests, source analysis, builds, CSS scoping, typechecking, bundle serving, server-function workers, thumbnails, UI component installation, and the error journal.                                                       |
| `scratchpad/`      | Canvas documents, assets, headless drawing, and browser screenshot requests.                                                                                                                                                            |
| `skills/`          | Bundled workspace skill installation, version checks, and updates. These modules manage the copies shipped under `workspace/`.                                                                                                          |
| `harness/`         | Provider adapters, transports, sessions, discovery, authentication, and readiness. See [the harness guide](harness/README.md).                                                                                                          |
| `collab/`          | Optional collaboration workers, presence, proxy identity, and the collaboration skill.                                                                                                                                                  |
| `test/`            | Integration tests and existing tests that share fixtures. Other unit tests live beside their modules.                                                                                                                                   |

Use direct module imports such as `workspaces/registry` or `sessions/store`.
Keep shared helpers in the feature that owns them. A folder does not imply a
strict dependency layer: workspace setup installs skills, applets use workspace
environment settings, and view builds coordinate with session metadata.

The two registries have different jobs: `workspaces/registry.ts` owns the local
workspace list; `harness/registry.ts` owns the available agent backends.

## Entry points and shared wiring

- `cli.ts` is the executable entry point used by `bin/moi.mjs` and `bun run dev`.
  It loads color setup before Citty, then `cli/index.ts`. The command tree keeps
  root help and demo/managed-user gates together.
- `web.ts` starts Bun's HTTP server, serves the SPA, handles chat and workspace
  event WebSockets, and owns shutdown. It delegates HTTP requests to `api/`.
- `control.ts` serves the loopback WebSocket used by CLI commands. Both transports
  call feature modules rather than each other.
- `events.ts` publishes workspace events. `state.ts` holds connected chat clients
  and broadcasts chat messages. `navigation-relay.ts` waits for browser navigation
  acknowledgements.
- `static.ts` locates the production client; `vendor.ts` serves browser dependencies.
  `constants.ts` defines the default HTTP and control addresses. `status.ts` renders
  server status; `debug.ts` controls console tracing.
- `service.ts`, `update.ts`, `server-cwd.ts`, and `version.ts` handle installation,
  process lifecycle, updates, and package identity. `app-config.ts`,
  `app-settings.ts`, and `data-dir.ts` own installation-wide settings and storage.
- `agent-launcher.ts` applies the configured OS-user launcher. `agent-caller.ts`
  detects CLI callers. `uploads.ts` validates and resolves chat uploads;
  `open-browser.ts` opens local browser links.

New server wiring can stay at the root. Feature implementations belong in the
corresponding directory above.

## Storage ownership

| State                                                                                                 | Location and owner                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace layout, theme, and tab configuration                                                        | `.moi/.workspace.json`, read and written by `workspaces/layout.ts`                                                                                                           |
| Applet source                                                                                         | `.moi/views/`, `.moi/widgets/`, and shared workspace source                                                                                                                  |
| Generated bundles and thumbnails                                                                      | `.moi/.build/` and `.moi/.cache/`; re-creatable                                                                                                                              |
| Scratchpad document and image bytes                                                                   | `.moi/.scratchpad.json` and `.moi/.scratchpad/`; preserve both                                                                                                               |
| Registered workspaces                                                                                 | `DATA_DIR/workspaces.json`, owned by `workspaces/registry.ts`                                                                                                                |
| Session attribution, settings, and fork metadata; selected and pinned sessions; pending view creation | `DATA_DIR/workspaces/<workspace id>/state.json`, stored by `workspace-state/`; meaning owned by `sessions/store.ts`, `sessions/selected.ts`, and `sessions/pending-views.ts` |
| Workspace environment preferences and secrets                                                         | `workspaces/env.ts`; metadata in `DATA_DIR`, secrets in the OS keychain or file fallback                                                                                     |
| Provider credentials and conversation history                                                         | Owned by each provider; see `harness/README.md`                                                                                                                              |

Client-local UI choices are documented in [the root instructions](../AGENTS.md)
and [view/chat behavior](../docs/view-chats.md). Changing a module's location
must not change its storage paths or persisted formats.

## Paths and process boundaries

CLI server launches use `PACKAGE_ROOT` from `version.ts` to locate `server/cli.ts`.
The dev supervisor watches `server/` and `lib/` recursively. Production workers
and the skill template loader also need to resolve files inside the installed
package, independent of the user's current directory.

Keep worker entry paths and any `import.meta.dir` expressions correct when moving
files. Check dynamic imports, child-process test scripts, and documentation too.
The package's `files` list includes the whole `server/` tree and excludes tests.

`applets/runtime/` contains browser-bundled sources despite living under `server/`.
Server-evaluated code must remain React-free; the scratchpad executor uses
`@tldraw/store` and `@tldraw/tlschema`. The guard is
`test/server-react-free.test.ts`.

## Checks and related guides

Run `bun run typecheck`, `bun run lint`, `bun run format:check`, and
`bun test server lib` for changes across server features. Tests that open HTTP
or WebSocket servers need local network access. Some service tests are specific
to Linux; follow their skip conditions on other platforms.

- [Scratchpad persistence and drawing](../docs/moi-scratchpad.md)
- [Applet checks and runtime errors](../docs/self-correction.md)
- [View creation and chat handoffs](../docs/view-chats.md)
- [Navigation](../docs/navigation.md)
- [UI component catalog](../docs/ui-components.md)
- [Installation and managed-user configuration](../docs/config.md)
