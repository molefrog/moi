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

Standalone Moi supports local workspaces only: no Cloud discovery, sharing, or collaboration calls. Through Batiok, browser requests use its existing session.

Each remote reference has a local registration ID for its folder, skills, tabs, and preferences. Shared content is requested directly at `/api/workspaces/{user_id}:{workspace_id}`. Batiok checks access and forwards to the owner's ordinary API. Applet RPC and file URLs follow the address from which the module was loaded. The browser combines owner layout with visitor preferences and saves each to its own endpoint.

CLI requests resolve the same config and authenticate through the existing Cloud client. They do not depend on browser cookies or a visitor-side HTTP relay.

- `tabs` and `navigate` use owner views and visitor tabs; navigation targets the visitor’s browser.
- `theme`, `config`, `call-server-fn`, `debug logs`, and scratchpad reads/edits use owner APIs. `refresh` and `scratch view` target the visitor’s browser.
- Skills and environment commands stay local. Source editing, builds, and agent-backed commands require the owner’s actual workspace.

## Discovery and collaboration

[`moi remote --json`](remote-cli.md) returns `{ me, workspaces }`; each workspace has `id` and `owner.id`. In Cloud mode, the home page calls `/cloud/api/workspaces/shared` with the browser session and mixes accepted shares with registered workspaces in one grid without creating folders. Registered workspaces keep the saved sidebar order; unopened shares appear first. Registered shares appear once and open directly. Pending invitations can be accepted on the homepage through Cloud. Acceptance refreshes the list and stays on the homepage; it creates no local files. Opening a share needs no machine login and creates a reference under the configured workspace root (normally `~/moi`), installs the skill, and registers it. Existing registrations keep their config and skill version. Unregistered shares removed from the Cloud list disappear on refresh; registered references remain in the grid and sidebar.

In cloud mode, presence uses `/api/workspaces/{user_id}:{workspace_id}/collab`. Membership controls use `/cloud/api/workspaces/{user_id}:{workspace_id}/...`; local workspaces use a plain ID. The host and accepted human members can invite and remove members; the host stays listed. Remote chat and leaving a workspace remain deferred.

Scratchpad documents and assets stay on the owner. Reopen the canvas to load edits made elsewhere; live owner-event updates and simultaneous editing are not supported. Browser saves replace the full document.

## Local mock owner

Use your local Batiok port below; these examples use `8787`.

1. Start Moi and Batiok. Set `MOCK_REMOTE_ORIGIN=http://127.0.0.1:13340` in Batiok’s `.dev.vars` and restart Wrangler.
2. Run `bun scripts/mock-owner.ts` from Moi.
3. Open Moi through Batiok and add the printed folder, normally `~/moi/shared-counter`. Existing references to `alice/owner-board` still work.

The script preserves existing configs, installs the visitor’s skill, and creates owner applets only if missing. Owner files and an isolated registry live in `moi-mock-owner` under the OS temporary directory. Restarts preserve the counter; the normal registry is untouched. Files remain after exit until removed or cleaned up by the OS.

`MOCK_VISITOR_DIR`, `MOCK_OWNER_DATA_DIR`, and `MOCK_OWNER_PORT` override those defaults. Update Batiok’s mock origin if changing the port. The override requires local request and app hostnames and a loopback mock origin; remove it to restore production routing. Restart the mock after code changes.

Increment **Shared counter** in Overview and the **Counter** view, then refresh to verify persistence. The script logs owner requests and prints the counter file. It includes the default Views widget and collaboration WebSockets. The local membership fixture lists Alice, Jamie, and the signed-in visitor; invites and removals are simulated without sending email and reset on restart. Cloud discovery is not simulated. Mock owner requests need no Cloud credentials; Batiok’s normal UI sign-in still applies.

Coverage: [owner API boundaries](../server/api/remote-workspace.test.ts), [CLI requests](../server/workspaces/api.test.ts), and [visual states](../tests/visual/workspace.visual.ts).
