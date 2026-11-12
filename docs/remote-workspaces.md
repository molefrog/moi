# Remote workspaces

A remote workspace is a registered local folder whose `.moi/.workspace.json` points to an owner's workspace.

## Config

Both forms use version 2. Version 1 local configs remain readable and upgrade on their next save.

Local:

```json
{
  "version": 2,
  "name": "Team board",
  "icon": { "type": "emoji", "value": "🌱" },
  "widgetGrid": [],
  "tabs": { "open": ["overview"], "active": "overview" },
  "layoutMode": "split",
  "selectedModel": "sonnet"
}
```

Remote:

```json
{
  "version": 2,
  "remote": { "user_id": "alice", "workspace_id": "team-board" },
  "tabs": { "open": ["overview"], "active": "overview" },
  "layoutMode": "split",
  "selectedModel": "sonnet"
}
```

Both forms support `layoutMode`, `selectedModel`, `selectedEffort`, and `selectedSpeedMode`. Layout mode defaults to `split`; missing chat options use the usual defaults. Remote preferences and tabs (open set, order, active tab) stay in the visitor’s config. Local cloud workspaces keep tabs in browser-tab storage.

Shared layout, name, icon, harness, theme, and content come from the owner. Icons use Moi’s standard fallback. Remote workspaces use the normal UI; settings entry points and chat are unavailable.

## Routing and CLI

A remote workspace is registered like any other folder and gets an ordinary local ID. The browser and CLI use `/api/workspaces/{workspace_id}` for local and remote workspaces alike; only the visitor’s server knows the difference.

For a folder whose config has `remote`, the visitor’s server:

- answers the registration itself (`GET` merges the owner’s layout with the visitor’s tabs and chat options; `PUT` saves the visitor’s part and sends shared edits to the owner);
- answers the personal routes (`/skills`, `/state`, `/sessions`, `/harness`) from the visitor’s folder;
- forwards every other request to `/api/remote/{user_id}/workspaces/{workspace_id}` at the configured Cloud URL and relays the answer.

Owner-served applet code carries the owner’s API prefix; the visitor’s server rewrites it to the local prefix, so applet RPC and file URLs come back through the same API. The owner refuses personal routes, view creation, and removal on the remote prefix. Presence is the one connection a visitor’s browser opens to the owner directly.

The gateway routes the remote prefix to the owner and preserves it. In cloud mode the visitor’s server passes the browser’s cookies along; elsewhere it sends none. Production gateway routing and access checks remain deferred.

CLI commands call the same workspace API as the browser, so they need no remote handling of their own:

- `tabs` lists owner views and marks the visitor’s saved active tab. `navigate` validates against those views and moves the visitor’s browser.
- `theme`, `config`, `call-server-fn`, `debug logs`, and scratchpad reads/edits use owner data. Function calls share the normal RPC worker pool; image edits upload visitor file bytes.
- `refresh` and `scratch view` target visitor browsers. Skills and environment commands stay local.
- Source editing, builds, and agent-backed commands remain deferred for remote references.

[`moi remote --json`](remote-cli.md) lists accepted shared workspaces: map `id` to `workspace_id` and `owner.id` to `user_id`. The home page lists accepted shares in **Shared with you** without changing files. Opening a share creates its reference under the configured workspace root (normally `~/moi`), installs the skill, and registers it. Existing references and personal settings are preserved. Removed shares disappear from this list; their local files remain. Cloud credentials stay in Moi’s data directory.

In cloud mode, presence connects to the owner’s `/collab` endpoint. Owners and accepted members share invite, revoke, and remove controls; the host stays listed. Membership requests use the Cloud API with `owner_id`. Invitation syncing and leaving a workspace remain deferred.

Scratchpad documents and assets stay on the owner. Reopen the canvas for edits made elsewhere; live owner-event updates and simultaneous editing are not supported. Browser saves replace the full document.

## Mock owner for localhost:8787

1. Start Moi and Batiok normally. Set `MOCK_REMOTE_ORIGIN=http://127.0.0.1:13340` in Batiok’s `.dev.vars` and restart Wrangler.
2. Set `remote.url` to `http://localhost:8787/cloud` in Moi’s data-directory `config.json` (see [Cloud CLI setup](remote-cli.md)); the visitor’s server reaches the owner through it. The mock needs no login.
3. Run `bun scripts/mock-owner.ts` from the Moi repository.
4. Open Moi (`http://localhost:8787`, or `http://localhost:13337` directly) and add the printed folder, normally `~/moi/shared-counter`. Existing references to `alice/owner-board` also work.

The script creates the visitor config only if missing and installs `moi-workspace` without scaffolding applets. Existing configs are preserved. Owner data and an isolated registry live in `moi-mock-owner` under the OS temporary directory; restarts preserve the counter and sources. The normal registry is untouched.

`MOCK_VISITOR_DIR`, `MOCK_OWNER_DATA_DIR`, and `MOCK_OWNER_PORT` override those defaults. Update Batiok’s origin if changing the port. Forwarding requires a local request hostname, local `APP_URL`, and a loopback mock origin. Remove `MOCK_REMOTE_ORIGIN` to disable it. Restart the script after code changes.

To test, increment **Shared counter** in Overview and the **Counter** view. Check the script’s `OWNER` logs and printed counter file, then refresh or restart to verify persistence. The mock supports presence WebSockets, but does not simulate Cloud membership or invitations. Owner files remain after Ctrl+C until removed or cleaned up by the OS.

Coverage: [forwarding and owner API](../server/api/remote-workspace.test.ts), [CLI requests](../server/workspaces/api.test.ts), and [visual states](../tests/visual/workspace.visual.ts).
