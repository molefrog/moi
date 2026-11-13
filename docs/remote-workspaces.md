# Remote workspaces

A remote workspace is a registered local folder whose `.moi/.workspace.json` points to an owner's workspace.

## Config

```json
{
  "version": 2,
  "remote": { "user_id": "alice", "workspace_id": "team-board" }
}
```

A remote config contains only `version` and `remote`; any other field is ignored. Local configs keep their existing shape, also at version 2. Version 1 local configs remain readable and upgrade on their next save.

Name, icon, layout, harness, theme, and content come from the owner. The folder holds only the config and the workspace skill. Open tabs and the active tab live in browser-tab storage. Remote workspaces open in fullscreen mode; chat and settings are unavailable.

## Routing

An unopened share uses `/workspace/{userId}:{workspaceId}`. That route creates or reuses the local reference, then redirects to `/workspace/{localId}`, preserving the destination path and query. Registered workspaces use the local registration ID directly. The workspace info response includes `apiBase` and `isRemote`. The loader keeps them in the workspace query and exposes the prefix through context:

- local: `/api/workspaces/{localId}`
- remote: `/api/workspaces/{user_id}:{workspace_id}`

The browser calls the remote prefix directly with its Batiok session. Batiok checks access and forwards to the owner's ordinary API; the visitor's Moi is not in the path. Applet RPC and file URLs follow the address the module was loaded from. For a remote reference, the visitor's own API serves only the reference and personal chat state. It answers 404 for shared content and rejects layout writes.

The standalone Moi UI supports local workspaces only: it hides remote registrations and makes no Cloud discovery, sharing, or collaboration calls.

CLI commands in a linked folder resolve the same config and authenticate through the Cloud login. See [Remote operations](remote-cli.md#remote-operations) for which command runs where.

## Discovery and collaboration

In Cloud mode the home page lists accepted shares from `/cloud/api/workspaces/shared` in the same grid as registered workspaces.

- Listing requests current names, icons, and themes from owner machines and wakes them when needed. If an owner request fails, the card keeps its registered metadata or falls back to the workspace ID.
- Accepting an invitation creates no local files. Opening a share creates the reference under the workspace root (normally `~/moi`), installs the skill, and registers it. Later opens leave an existing reference and skill untouched.
- A registered reference stays in the grid and sidebar after the share disappears from Cloud.

Presence uses `{prefix}/collab`. Membership controls use `/cloud${apiBase}/members` and `/cloud${apiBase}/invitations`. Non-React consumers read the same workspace query; there is no separate routing cache. These fields are response metadata and are never saved in the workspace config. The host and accepted human members can invite and remove members. Leaving a workspace from the UI is not available yet.

Scratchpad documents and assets stay on the owner. Browser saves replace the full document, and there is no live sync: reopen the canvas to load edits made elsewhere.

## Local mock owner

`scripts/mock-owner.ts` runs an owner on this machine so the remote path can be tried without a second computer. These examples use Batiok on port `8787`.

1. Start Moi and Batiok. Set `MOCK_REMOTE_ORIGIN=http://127.0.0.1:13340` in Batiok’s `.dev.vars` and restart Wrangler.
2. Run `bun scripts/mock-owner.ts` from Moi.
3. Open Moi through Batiok and add the printed folder, normally `~/moi/shared-counter`.

Increment **Shared counter** in Overview and in the **Counter** view, then refresh to check it persisted. The script logs owner requests.

Owner files and an isolated registry live in `moi-mock-owner` under the OS temporary directory; your normal registry is untouched. `MOCK_VISITOR_DIR`, `MOCK_OWNER_DATA_DIR`, and `MOCK_OWNER_PORT` override the defaults. Membership is a fixture that resets on restart, and Cloud discovery is not simulated. Restart the mock after code changes, and remove `MOCK_REMOTE_ORIGIN` to restore production routing.

Coverage: [owner API boundaries](../server/api/remote-workspace.test.ts), [CLI requests](../server/cli/remote-control.test.ts), and [visual states](../tests/visual/workspace.visual.ts).
