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

Each reference has a local registration ID. Browser and CLI requests use `/api/workspaces/{localRegistrationId}`. Moi keeps skills, chat state, tabs, and personal preferences on the visitor; shared content goes to `/api/workspaces/{user_id}:{workspace_id}` at `remote.url`.

Batiok resolves that address and forwards `/api/workspaces/{workspace_id}` to the owner. Moi rewrites returned applet API URLs to the visitor’s registration so RPC and file requests follow the same route. Shared saves preserve the owner’s personal preferences. Workspace removal and agent-backed view creation/submission are unavailable; existing views can be renamed or deleted.

- `tabs` and `navigate` use owner views and visitor tabs; navigation targets the visitor’s browser.
- `theme`, `config`, `call-server-fn`, `debug logs`, and scratchpad reads/edits use owner APIs. `refresh` and `scratch view` target the visitor’s browser.
- Skills and environment commands stay local. Source editing, builds, and agent-backed commands require the owner’s actual workspace.

Production integration is incomplete: owner requests do not yet attach saved Cloud access tokens. Forwarded browser requests carry cookies only in cloud mode; metadata requests carry no browser credentials. Batiok’s current allowlist also excludes home previews, reading/clearing applet logs, and scratchpad operations. The local mock bypasses those Cloud checks.

## Discovery and collaboration

[`moi remote --json`](remote-cli.md) returns `{ me, workspaces }`; each workspace has `id` and `owner.id`. The home page lists accepted shares in **Shared with you** without creating folders. Opening one creates a reference under the configured workspace root (normally `~/moi`), installs the skill, and registers it. Existing registrations keep their config and skill version. Shares removed from the Cloud list disappear on refresh; local references remain.

In cloud mode, presence uses `/api/workspaces/{user_id}:{workspace_id}/collab`. Membership controls use `/cloud/api/workspaces/{user_id}:{workspace_id}/...`; local workspaces use a plain ID. The host and accepted human members can invite and remove members; the host stays listed. Remote chat and leaving a workspace remain deferred.

Scratchpad documents and assets stay on the owner. Reopen the canvas to load edits made elsewhere; live owner-event updates and simultaneous editing are not supported. Browser saves replace the full document.

## Local mock owner

Use your local Batiok port below; these examples use `8787`.

1. Start Moi and Batiok. Set `MOCK_REMOTE_ORIGIN=http://127.0.0.1:13340` in Batiok’s `.dev.vars` and restart Wrangler.
2. Set Moi’s `remote.url` to `http://localhost:8787/cloud` in its data-directory `config.json` (see [Cloud CLI setup](remote-cli.md)).
3. Run `bun scripts/mock-owner.ts` from Moi.
4. Open Moi through Batiok or at `http://localhost:13337` and add the printed folder, normally `~/moi/shared-counter`. Existing references to `alice/owner-board` still work.

The script preserves existing configs, installs the visitor’s skill, and creates owner applets only if missing. Owner files and an isolated registry live in `moi-mock-owner` under the OS temporary directory. Restarts preserve the counter; the normal registry is untouched. Files remain after exit until removed or cleaned up by the OS.

`MOCK_VISITOR_DIR`, `MOCK_OWNER_DATA_DIR`, and `MOCK_OWNER_PORT` override those defaults. Update Batiok’s mock origin if changing the port. The override requires local request and app hostnames and a loopback mock origin; remove it to restore production routing. Restart the mock after code changes.

Increment **Shared counter** in Overview and the **Counter** view, then refresh to verify persistence. The script logs owner requests and prints the counter file. It supports collaboration WebSockets but does not simulate Cloud discovery, memberships, or invitations. Mock owner requests need no Cloud credentials; Batiok’s normal UI sign-in still applies.

Coverage: [owner API forwarding](../server/api/remote-workspace.test.ts), [CLI requests](../server/workspaces/api.test.ts), and [visual states](../tests/visual/workspace.visual.ts).
