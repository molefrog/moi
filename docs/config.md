# Config

`config.json` describes how moi is deployed. A normal local install has no file and needs none. moi reads the file once at startup, so restart moi after changing it, and no API can write it.

It lives in moi's data folder: `MOI_DATA_DIR` if set, otherwise `~/Library/Application Support/moi` on macOS and `~/.local/share/moi` on Linux. A missing file is fine. A broken file or a wrong value prints a warning and falls back to the default, so a bad config never stops moi.

Some options can also be set with environment variables, which win over the file.

```json
{
  "cloudDemo": false,
  "demoInstallUrl": "https://moi.computer",
  "cloudflareAccess": { "teamDomain": "acme", "audience": ["<AUD tag>"] },
  "workspacesDir": "/data/workspaces",
  "agentLauncher": "/opt/moi/bin/agent-run",
  "unixSocket": "/run/moi/web.sock"
}
```

## Demo

| Option           | Env                    | Default                |
| ---------------- | ---------------------- | ---------------------- |
| `cloudDemo`      | `MOI_CLOUD_DEMO`       | `false`                |
| `demoInstallUrl` | `MOI_DEMO_INSTALL_URL` | `https://moi.computer` |

For the public cloud demo. `cloudDemo` blocks creating workspaces (the UI shows a promo instead) and turns off the `moi` system commands except `start` and `version`. `demoInstallUrl` is where that promo links. If the demo gate must never fail open, set `MOI_CLOUD_DEMO=1` in the environment: an unreadable file can't switch it off.

## Cloudflare Access

| Option                        | Env                                 |
| ----------------------------- | ----------------------------------- |
| `cloudflareAccess.teamDomain` | `MOI_CLOUDFLARE_ACCESS_TEAM_DOMAIN` |
| `cloudflareAccess.audience`   | `MOI_CLOUDFLARE_ACCESS_AUD`         |

For moi behind Cloudflare Access (Zero Trust). moi checks the token Access adds to each request and uses its email as the viewer's profile. `teamDomain` is `acme`, `acme.cloudflareaccess.com` or its https URL. `audience` is the application's AUD tag, or a list of them (comma-separated in the env). Both are needed; with only one, moi trusts nobody and says so. Unset, moi trusts no proxy.

## Managed machines

For a machine that runs moi for an organization in the cloud, where moi and the agent run as different OS users. These three come from the file only, with no env override, so whoever writes the file (the machine's start script) decides them.

| Option          | Default           |
| --------------- | ----------------- |
| `workspacesDir` | `~/moi`           |
| `agentLauncher` | none              |
| `unixSocket`    | none (port 13337) |

All three must be absolute paths.

**`workspacesDir`**: the folder that workspaces created in the UI go into. Use it when the home folder is the wrong place, for example to keep workspaces on a persistent disk.

**`agentLauncher`**: an executable that every agent process starts through: `agentLauncher <command> <args…>`. That covers Claude Code, Codex, function workers, applet builds, installs and chat titles. It must switch to the agent's user, drop anything that user may not have, set `HOME` to the agent's home, and `exec` the command, keeping stdin, stdout and the rest of the environment. Use it to keep the agent out of moi's data folder. When set:

- moi must be able to read and write the agent's files (chat histories, workspaces). The machine grants this; moi doesn't check.
- The agent can't open moi's data folder, so its `moi` CLI works through the running server. `init`, `start`, `service`, `update` and the provider `init`s refuse to run for it; `version` and `status` still work.
- New code that starts agent processes must use `agentCommand()` or `claudeCodeSpawn()` from `server/agent-launcher.ts`, or it runs as moi's user.

**`unixSocket`**: a socket file the web side listens on instead of port 13337. Put it in a folder only the machine's gateway can open, so nothing else on the machine, the agent included, reaches the API meant for people.

## Not in the config

Experimental features are switched on only with `moi start` flags, such as `--experimental-collab`. User settings live in `settings.json` and change while moi runs.
