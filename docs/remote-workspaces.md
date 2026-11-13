# Remote workspaces

A remote workspace is a registered local folder whose `.moi/.workspace.json` points to an owner's workspace.

## Config

```json
{
  "version": 2,
  "remote": { "user_id": "alice", "workspace_id": "team-board" }
}
```

A remote config contains only `version` and `remote`; any other field is ignored. Local configs keep their existing format at version 1; opening or saving them does not migrate them.

Name, icon, layout, harness, theme, and content come from the owner. The folder holds only the config and the workspace skill. Open tabs and the active tab live in browser-tab storage. Remote workspaces open in fullscreen mode; chat and settings are unavailable.

## Routing

An unopened share uses `/workspace/{userId}:{workspaceId}`. That route creates or reuses the local reference, then redirects to `/workspace/{localId}`, preserving the destination path and query. Registered workspaces use the local registration ID directly. The workspace info response includes `apiBase` and `isRemote`: local responses contain a complete layout, while remote responses contain the reference. The client loads the owner layout before mounting workspace content. The loader keeps them in the workspace query and exposes the prefix through context:

- local: `/api/workspaces/{localId}`
- remote: `/api/workspaces/{user_id}:{workspace_id}`

The browser calls the remote prefix directly with its Batiok session. Batiok checks access and forwards to the owner's ordinary API; the visitor's Moi is not in the path. Applet RPC and file URLs follow the address the module was loaded from. For a remote reference, the visitor's own API serves only the reference and personal chat state. It answers 404 for shared content and rejects layout writes.

The standalone Moi UI supports local workspaces only: it hides remote registrations and makes no Cloud discovery, sharing, or collaboration calls.

`moi init [directory] --remote ownerId:workspaceId` installs the reference and skill. CLI commands use that config and the saved Cloud login. See [Remote operations](remote-cli.md#remote-operations) for where commands run.

## Discovery and collaboration

In Cloud mode the home page lists accepted shares from `/cloud/api/workspaces/shared` in the same grid as registered workspaces.

- Discovery lists are merged and deduplicated before requesting current names, icons, and themes from each owner. These requests wake machines when needed, run independently, and use the same workspace info queries as the workspace loader, home, and sidebar, so slow owners do not delay other cards. Cards select their display fields from the full info response; there is no separate metadata cache. If an owner request fails, the card keeps its registered metadata or falls back to the workspace ID.
- Accepting an invitation creates no local files. Opening a share creates the reference under the workspace root (normally `~/moi`), installs the skill, and registers it. Later opens leave an existing reference and skill untouched.
- A registered reference stays in the grid and sidebar after the share disappears from Cloud.

Presence uses `{prefix}/collab`. Membership controls use `/cloud${apiBase}/members` and `/cloud${apiBase}/invitations`. Non-React consumers read the same workspace query; there is no separate routing cache. These fields are response metadata and are never saved in the workspace config. The host and accepted human members can invite and remove members. Leaving a workspace from the UI is not available yet.

Scratchpad documents and assets stay on the owner. Browser saves replace the full document, and there is no live sync: reopen the canvas to load edits made elsewhere.

## Local mock workspace

With Moi running in Cloud mode and Batiok on `8787`, run from the Moi repo:

```sh
bun scripts/mock-remote-workspace.ts
```

Open [localhost:9898](http://localhost:9898). No Batiok environment changes or restart needed.

Coverage: [mock workspace flow](../scripts/mock-remote-workspace.test.ts), [owner API boundaries](../server/api/remote-workspace.test.ts), [CLI requests](../server/cli/remote-control.test.ts), and [visual states](../tests/visual/workspace.visual.ts).
