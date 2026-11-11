# Moi Cloud CLI

`moi remote login` opens your browser to sign in to Moi Cloud. Approve the displayed code, then return to the terminal. Use `moi remote login --no-browser` to open the printed link yourself.

`moi remote` shows your account and the workspaces shared with you. It does not list local workspaces; use `moi status` for those. `moi remote --json` prints the same cloud data as JSON.

`moi remote logout` revokes your refresh token and removes local credentials. If the cloud is unreachable, credentials remain so you can retry. Cloud-managed credentials cannot be replaced or logged out with these commands.

Credentials live in `remote-auth.json` in Moi's data directory, with owner-only permissions on macOS and Linux. The file contains the access token, refresh token, Cloud URL, and public client ID. Access tokens refresh automatically; no client secret is needed. Keep this file private.

Logout revokes future refreshes. An already issued access token can remain valid for up to one hour.

## Test with a local cloud

Use an isolated data directory so testing does not change your normal Moi configuration:

```sh
export MOI_DATA_DIR="$(mktemp -d)"
printf '%s\n' '{"remote":{"url":"http://localhost:8787/cloud"}}' > "$MOI_DATA_DIR/config.json"
bun server/cli.ts remote login
bun server/cli.ts remote
bun server/cli.ts remote logout
```

Published installs default to `https://run.moi.computer/cloud`, and the public client ID is `moi-cli`. Both can be set through `remote.url` and `remote.clientId` in `config.json`. Managed machines set `remote.managed` to `true`. The URL includes the cloud mount path; the CLI appends `/api/...`. HTTP is accepted only for localhost testing. Source checkouts (including `bun link`) and `NODE_ENV=development` require an explicit `remote.url`, so development never silently targets production.

## Use from server code

```ts
import { fetchSharedWorkspaces } from './remote/client'

const workspaces = await fetchSharedWorkspaces()
// [{ id, owner: { id, name, email, ... } }]
```

The function uses the configured Cloud URL and saved credentials, refreshing the access token when it has less than 30 seconds left. It returns accepted shared workspaces and throws on authentication or network failure. It does not require the CLI or open a browser.

Credentials use the same data-directory layout in every environment. Set `MOI_DATA_DIR` to a different directory to keep local testing and production logins separate. Saved credentials are bound to their Cloud URL (including its mount path) and client ID: changing either requires a new login, and never sends the previous login's tokens to the new target.

Normal reads do not take a file lock. Refresh, login, and logout coordinate across processes, and credential replacements are atomic. An abandoned lock is recoverable after one minute.

## Pending invitations

Server code can list invitations addressed to the signed-in user's verified email and accept them by ID:

```ts
import { fetchInvitations, acceptInvitation, fetchSharedWorkspaces } from './remote/client'

const invitations = await fetchInvitations()
// [{ id, workspaceId, workspaceName, inviter: { id, name, email, avatar? }, expiresAt }]

await acceptInvitation(invitations[0]!.id)
const workspaces = await fetchSharedWorkspaces()
```

These helpers use the same saved credentials and automatic refresh as shared-workspace listing, including cloud-managed installations. They call `GET /cloud/api/invitations` and `POST /cloud/api/invitations/:id/accept` (JSON body `{}`). The list excludes accepted, expired, and revoked invitations. Acceptance checks the authenticated user's verified email; the email-link token is not required. After acceptance, refresh both lists in the UI. No UI is included in these helpers.

Listing requires `workspaces:read`; acceptance requires `workspaces:access`. Older CLI logins without the access scope need a new `moi remote login`; refreshing cannot add a scope. Managed credentials receive these scopes at machine startup.
