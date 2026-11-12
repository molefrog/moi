# Moi Cloud CLI

`moi remote login` opens your browser to sign in to Moi Cloud. Approve the displayed code, then return to the terminal. Use `moi remote login --no-browser` to open the printed link yourself.

`moi remote` shows your account, the workspaces shared with you, and the current folder's remote link, if any. It does not list local workspaces; use `moi status` for those. `moi remote --json` prints the same cloud data as JSON.

`moi remote logout` revokes your refresh token and removes local credentials. If the cloud is unreachable, credentials remain so you can retry. Cloud-managed credentials cannot be replaced or logged out with these commands.

Credentials live in `remote-auth.json` in Moi's data directory, with owner-only permissions on macOS and Linux. The file contains the access token, refresh token, Cloud URL, and public client ID. Access tokens refresh automatically; no client secret is needed. Keep this file private.

Logout revokes future refreshes. An already issued access token can remain valid for up to one hour.

## Invitations and folders

```sh
moi remote invitations
moi remote accept <invitation-id-or-url>
moi remote link
moi remote link --owner-id <owner> --workspace-id <workspace> --path ./project
moi remote unlink --path ./project
moi remote leave --owner-id <owner> --workspace-id <workspace>
```

Humans accept human invitations with `accept`. `link` offers a workspace selection in an interactive terminal; agents and scripts supply both IDs. It records the remote target in `.moi/.workspace.json`, installs the workspace skill, and registers the folder with Moi. It refuses to overwrite a different workspace configuration. It does not download remote files.

`unlink` removes the folder's remote link and keeps its files and cloud membership. `leave` removes cloud membership and keeps local files. Without IDs, `leave` uses the current folder's link. Folder commands also accept `--path`, and status, invitation, and folder commands support `--json`.

## Invited agents

An agent cannot sign up without an invitation. Give it a separate Moi data directory if a human already uses this installation:

```sh
moi remote join <invite-url> --name "Lawyer" --client "Grok Bot"
moi remote
moi remote rename-agent "Legal assistant"
moi remote invitations
moi remote join <another-invitation-id-or-url>
moi remote logout
moi remote logout --yes
```

The first join creates the agent identity. The cloud normalizes the reported client, for example `Grok Bot` becomes `grok-bot`. Later joins reuse that identity. Agents use `join`, while humans use `accept`; neither command replaces the other kind of login. Agents can link, unlink, and leave workspaces using the same commands as humans.

Agent credentials contain locally generated private keys and their agent/host IDs in `remote-auth.json`, with owner-only permissions. Each request gets a fresh, short-lived signature; there is no agent refresh token. During the first join, keys are saved in `remote-agent-pending.json` before sending the request. If the response is lost, retry the same invitation to keep the same identity.

Agent logout first prints a warning. `logout --yes` revokes the login and deletes its local keys; that login cannot be restored. Leaving every workspace keeps the agent identity, so it can receive another invitation.

Remote file and command operations are not implemented by these commands yet.

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

The function uses the configured Cloud URL and saved credentials. It refreshes a human access token when it has less than 30 seconds left, or signs an agent request. It returns accepted shared workspaces and throws on authentication or network failure. It does not require the CLI or open a browser.

Credentials use the same data-directory layout in every environment. Set `MOI_DATA_DIR` to a different directory to keep local testing and production logins separate. Saved credentials are bound to their Cloud URL (including its mount path) and client ID: changing either requires a new login, and never sends the previous login's tokens to the new target.

Normal reads do not take a file lock. Refresh, login, and logout coordinate across processes, and credential replacements are atomic. An abandoned lock is recoverable after one minute.
