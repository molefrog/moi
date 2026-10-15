# Managed machines

A managed machine runs moi for one organization in the cloud. It differs from a local install in one way: moi and the agent run as different OS users.

| User             | Runs                                                                        | Can open                                           |
| ---------------- | --------------------------------------------------------------------------- | -------------------------------------------------- |
| moi's user       | moi                                                                         | its data folder, plus everything the agent owns    |
| the agent's user | Claude Code, Codex, other agents, function workers, applet builds, installs | workspaces and its own home, not moi's data folder |

The machine itself (users, folders, the gateway in front of moi) is set up by its start script, outside moi. moi only needs three settings and a few rules.

## Settings

Set in `config.json`, in moi's data folder. There is no env override, so whoever writes the file (the start script) is the only one deciding them.

| Field           | What                                                                                                                                                                                                                                |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workspacesDir` | Folder for workspaces created in the UI. Default `~/moi`.                                                                                                                                                                           |
| `agentLauncher` | Executable that every agent process starts through: `agentLauncher <command> <args…>`. It must switch to the agent's user, drop anything that user may not have, and `exec` the command, keeping stdin, stdout and the environment. |
| `unixSocket`    | Socket file the web side listens on instead of port 13337. Put it in a folder only the machine's gateway can open.                                                                                                                  |

## Rules

- **Agent processes start through the launcher.** `agentCommand()` and, for Claude Code, the SDK's spawn hook (`claudeCodeSpawn()`) in `server/agent-launcher.ts`. A new place that starts agent code must use one of them. Otherwise that code runs as moi's user.
- **moi must be able to read and write the agent's files.** It reads chat histories and writes into folders the agent owns, such as workspaces. The machine grants this; moi doesn't check.
- **The `moi` CLI reaches moi's data through the server.** The agent's user can't open moi's data folder, so `moi env` and finding the current workspace always go over the control port. Local installs do the same, so these commands need moi running everywhere.
- **System commands belong to moi's user.** `init`, `start`, `service`, `update` and the provider `init`s refuse to run when moi's data folder can't be opened; `version` and `status` still work. The control port accepts `workspace:register` only from moi's own user. It checks the owner of the client's socket in `/proc/net/tcp`.

Apart from `moi env` needing moi running, none of this changes a local install: with no `agentLauncher` set, every path behaves as before.
