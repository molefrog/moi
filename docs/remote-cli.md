# Moi Cloud CLI

`moi remote login` opens the browser for human sign-in; `--no-browser` prints the link.
`moi remote [--json]` shows your account, accepted workspaces, and this folder's remote target.
Use `moi status` for local workspaces.

Human credentials live in `remote-auth.json` in Moi's data directory, with owner-only permissions
on macOS and Linux. Access tokens refresh automatically. `remote logout` revokes the refresh token
and deletes credentials; if Cloud is unreachable, it keeps them for retry. Existing access tokens
may remain valid for up to one hour. Cloud-managed credentials cannot be replaced or logged out.

## Invitations and workspace setup

Humans sign in with `moi remote login`. A new agent accepts an agent invitation URL with a name
and client. Use a separate `MOI_DATA_DIR` if this installation already has a human login.

```sh
moi remote accept "<agent-invite-url>" --name "Lawyer" --client grok-bot
# Use the address printed by accept
moi init ./project --remote <ownerId>:<workspaceId> --json
```

Later `accept` calls reuse the saved identity. `--name` and `--client` apply only to creation;
rename an agent with `moi remote rename-agent "Legal assistant"`. Client must be `grok-bot`,
`instinct`, `muse`, `dot`, `duet`, or `other`.

`accept` prints the init command. With `--json`, it returns `remote: { user_id, workspace_id }`
matching the config, plus `success` and `membershipId`. First agent acceptance also returns
`agentId` and `hostId`.

```sh
moi remote invitations --json
moi remote accept "<invitation-id-or-url>"
moi remote leave                        # Current folder's remote workspace
moi remote leave <ownerId>:<workspaceId> # Explicit workspace
moi remote leave --path ./project       # Another folder's remote workspace
```

`moi init [directory]` creates a local workspace at version 1. With `--remote`, it writes the
version 2 remote reference, installs the skill, and registers the folder without downloading
files. The directory defaults to the current folder. Repeat initialization is safe for the same
target; conflicting configs and duplicate registrations at other paths are rejected.

Remote initialization supports `--json` or `--web` separately. `--web` starts the local UI;
otherwise no local server is needed. `--harness` and `--id` are local-only.

`leave` removes cloud membership and keeps local files and registration. To remove only the
registration, use Moi's workspace UI. Removing a registration or folder keeps cloud access.

## Agent credentials

Agent keys and IDs live in `remote-auth.json`, with owner-only permissions. Requests use fresh,
short-lived signatures. First acceptance saves keys in `remote-agent-pending.json` before sending;
if the response is lost, retry the same invitation to reuse the identity, name, and client.

`moi remote logout --yes` revokes the agent login and deletes its keys permanently. Leaving all
workspaces keeps the identity available for future invitations.

## Remote operations

Run these from a remote workspace folder, or add `--path ./project`.

```sh
moi remote read notes.txt
moi remote write notes.txt "Hello"
cat notes.txt | moi remote write notes.txt
moi remote patch notes.txt --patch-file ./change.diff
moi remote file-upload ./photo.png assets/photo.png
moi remote file-download assets/photo.png ./download.png
moi remote exec 'pwd; ls -la'
```

Ordinary workspace commands keep their usual arguments and output:

| Commands                                                                             | Runs on                           | Through                                                |
| ------------------------------------------------------------------------------------ | --------------------------------- | ------------------------------------------------------ |
| `remote read`, `write`, `patch`, `file-upload`, `file-download`, `exec`              | owner                             | operations API                                         |
| `bundle`, `check`, `views`, `theme`, `call-server-fn`, `debug logs`, `ui-components` | owner                             | operations API, returns `{ exitCode, stdout, stderr }` |
| `config`, `tabs`, `scratch` reads and edits                                          | owner                             | ordinary workspace API                                 |
| `refresh`, `navigate`, `scratch view`                                                | visitor's running Moi and browser | local control server                                   |

Only the last row needs a local Moi server. Skills, environment, start, stop, and install commands stay local.

File paths are relative to the remote workspace root. Paths that name a file on your machine stay local: upload sources, download destinations, `--patch-file`, `config icon` and `scratch add image` inputs, and `scratch read-image` / `scratch view --out` outputs. `patch` accepts an exact unified diff; a conflict leaves the file unchanged. File access rejects traversal and symlinks.

`exec` runs with the host's Moi permissions in the workspace directory, which is not an operating-system sandbox. It streams stdout and stderr and returns the remote exit code; `--json` emits newline-delimited `stdout`, `stderr`, and final `exit` events. Ctrl-C sends a signed cancellation for that execution and kills its process group; only the same caller in the same workspace can cancel it. An interrupted connection is not retried, because the command may already have changed files.

Owner-executed workspace commands finish before returning, with up to 8 MiB per output stream; use `exec` for long streamed output. Human uploads stream through Cloud. Agent uploads are limited to 16 MiB because Agent Auth signs the exact request bytes.

The Cloud route is `/cloud/api/workspaces/{ownerId}:{workspaceId}/ops/*`. Cloud verifies the caller and workspace access, then the host gateway forwards to Moi's separate `ops.sock` listener as `/workspaces/{workspaceId}/*`. These handlers are never registered on the browser HTTP API.

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
