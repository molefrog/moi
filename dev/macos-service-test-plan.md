# macOS test plan: `moi service` + `moi update`

Instructions for an agent running locally on the maintainer's Mac. Goal:
verify the service/update feature end to end on real launchd — the parts a
Linux sandbox could not: `launchctl` behavior, the login-item notification,
Keychain-backed agent auth under a daemon, and a real global install.

Feature branch: `claude/rfc-service-update-tqe6fi`. Spec: `dev/rfc-service-and-update.md`.
Already verified elsewhere (do not re-derive): unit-file generation and
escaping, env allowlist, package-manager detection, the full `moi update`
flow against a mock registry, SIGTERM shutdown, EADDRINUSE exit codes —
`bun test` covers all of it.

## Ground rules

- macOS only. Abort with a clear message on any other OS.
- You will modify this machine: a global moi install and a LaunchAgent.
  Record what exists before you touch it; restore it at the end.
- Never use sudo. Nothing in this plan needs it.
- If a step's outcome does not match EXPECT, do not improvise a fix —
  capture the output, mark FAIL, continue with what still makes sense, and
  report at the end.
- Ask the user before anything destructive beyond the listed steps.

## 0. Preflight — record existing state

```sh
sw_vers && bun --version                      # need bun >= 1.3
which moi; readlink "$(which moi)" || true    # existing install, if any
ls -l ~/Library/LaunchAgents/computer.moi.server.plist 2>/dev/null
launchctl print "gui/$(id -u)/computer.moi.server" 2>/dev/null | head -5
curl -s --max-time 2 http://localhost:13337/status | head -3   # running server?
```

Save all of it. If a moi service is already installed, copy the plist aside:
`cp ~/Library/LaunchAgents/computer.moi.server.plist /tmp/moi-plist-backup`.
If a foreground server is running, ask the user before stopping it.

Isolate app state for the whole session so the test never touches the real
registry (`MOI_DATA_DIR` is allowlisted into the captured service env, so the
service inherits the isolation):

```sh
export MOI_DATA_DIR=$(mktemp -d /tmp/moi-test-data.XXXX)
```

## 1. Build and install the real artifact

From the repo on the feature branch:

```sh
git status                       # confirm branch, clean tree
bun install && bun test          # EXPECT: all pass (~856)
bun pm pack                      # prepack builds dist/
bun install -g ./moi-computer-*.tgz
readlink ~/.bun/bin/moi          # EXPECT: points into .bun global tree
moi version                      # EXPECT: version, no commit suffix
```

Also confirm the checkout refusal from the repo itself:
`bun server/cli.ts service install` → EXPECT: refuses, "source tree (git checkout)".

## 2. Service install

```sh
moi service install
```

EXPECT: `✓ Service installed (launchd)`, unit + logs paths, `server vX.Y.Z
running on http://localhost:13337 (pid N)`, and the note about the macOS
login-item notification. Then verify each layer:

```sh
stat -f '%Lp' ~/Library/LaunchAgents/computer.moi.server.plist   # EXPECT: 600
launchctl print "gui/$(id -u)/computer.moi.server" | grep -E 'state|pid'
curl -s http://localhost:13337/status | head -4    # EXPECT: version + (service-managed)
moi status                                          # EXPECT: service-managed, versions match
moi service                                         # EXPECT: ● running (pid N)
```

Inspect the plist (`plutil -p`): ProgramArguments is `<moi-bin> start`
(argv[0] is the moi bin — its basename is the login-item display name); env
contains `PATH` (starting with the bun dir), `MOI_SERVER=1`, `MOI_SERVICE=1`,
`HOME`; env does NOT contain `TERM`, `PWD`, `HOST`, `HOSTNAME`, `PORT`,
`SSH_AUTH_SOCK`, or any `CLAUDE_*` session vars (even when installing from
inside a Claude Code session).

Ask the user: did macOS show a "background items added" notification, and
does a "moi" item appear under System Settings → General → Login Items?
Record their answer.

## 3. Crash restart

```sh
PID=$(launchctl print "gui/$(id -u)/computer.moi.server" | awk '/pid =/{print $3}')
kill -9 "$PID"
```

EXPECT: launchd respawns it with a new pid. IMPORTANT: `ThrottleInterval=60`
means the respawn can be delayed up to ~60s if the job had been running less
than 60s — poll `moi service` for up to 70s before calling FAIL. The new pid
must differ and `/status` must answer again.

## 4. Startup-failure idle protocol (the anti-crash-loop)

Occupy the HTTP port, force a restart, and confirm the service parks itself
instead of looping:

```sh
bun -e 'Bun.serve({port:13337,fetch:()=>new Response("blocker")});await new Promise(()=>{})' &
BLOCKER=$!
moi service restart    # EXPECT: reports the server did not come up
sleep 5
moi service            # EXPECT: state ○ idle (NOT rapid-respawning)
moi service logs | tail -5   # EXPECT: "Port already in use … service stays idle"
launchctl print "gui/$(id -u)/computer.moi.server" | grep state   # EXPECT: not running
kill $BLOCKER
moi service restart    # EXPECT: green again, server up
```

Watch for a respawn loop while the port is blocked (macOS has no `timeout`
command — compare counts instead): count the failure lines, wait 30s, count
again. The count must not have grown — one more at most:

```sh
grep -c 'Port already in use' "$HOME/Library/Application Support/moi/logs/server.log"
sleep 30
grep -c 'Port already in use' "$HOME/Library/Application Support/moi/logs/server.log"
```

## 5. Logs and rotation

```sh
moi service logs           # EXPECT: prints path + recent lines
LOG=~/Library/'Application Support'/moi/logs/server.log
mkfile -n 6m /tmp/pad && cat /tmp/pad >> "$LOG"    # push past the 5MB cap
moi service restart
sleep 3; ls -lh "$LOG" "$LOG.old"   # EXPECT: .old ~6MB, live log small
```

## 6. Agent session under the daemon (the critical Keychain check)

This is the RFC's headline `[verify]`: agents must work when the server runs
under launchd with the captured env only — including Claude Code auth, which
lives in the Keychain/`~/.claude`, not in env vars.

```sh
WS=$(mktemp -d /tmp/moi-test-ws.XXXX) && cd "$WS" && moi init
```

Then send one real chat message through the service server. Talk to the chat
WebSocket directly (protocol: `lib/types.ts`); workspace id from
`$MOI_DATA_DIR/workspaces.json`:

```sh
bun -e '
const wsId = JSON.parse(await Bun.file(process.env.MOI_DATA_DIR + "/workspaces.json").text())[0].id
const sock = new WebSocket("ws://localhost:13337/ws")
const done = Promise.withResolvers()
sock.onopen = () => sock.send(JSON.stringify({ type: "chat", workspaceId: wsId,
  sessionId: crypto.randomUUID(), isNew: true, content: "Reply with the single word: pong" }))
sock.onmessage = e => { const m = JSON.parse(e.data); console.log(m.type);
  if (JSON.stringify(m).includes("pong") && m.type !== "status_snapshot") done.resolve() }
setTimeout(() => done.reject(new Error("no assistant reply in 120s")), 120000)
await done.promise
console.log("AGENT REPLIED UNDER THE DAEMON ✓")'
```

EXPECT: message frames stream and the probe prints the success line. If it
fails, capture `moi service logs | tail -40` and `curl -s
localhost:13337/status` — the live-session section shows whether the claude
executable was found and the session errored.

## 7. Coexistence + update surface

```sh
moi start                    # EXPECT: "The moi service is already running … Manage it with `moi service`"
moi update --check; echo "exit=$?"   # packed version is a prerelease →
                             # EXPECT: prerelease message, exit 0
moi update                   # EXPECT: same gate, nothing installed
```

## 8. Uninstall

```sh
moi service uninstall        # EXPECT: ✓ Service removed
launchctl print "gui/$(id -u)/computer.moi.server" 2>&1 | head -1   # EXPECT: error / not found
curl -s --max-time 2 http://localhost:13337/status; echo "exit=$?"  # EXPECT: connection refused
ls ~/Library/LaunchAgents/computer.moi.server.plist 2>&1            # EXPECT: gone
```

## 9. Restore

- Remove the test install if the user had a different one: reinstall their
  previous setup (`bun link` from their checkout, or their prior global) and
  confirm `moi version` matches the preflight record.
- If a plist backup was taken in step 0, put it back and `launchctl
bootstrap gui/$(id -u)` it — ask the user first.
- `rm -rf "$MOI_DATA_DIR" "$WS" /tmp/pad ./moi-computer-*.tgz`

## 10. Optional human follow-ups (report as PENDING, not FAIL)

- Reboot the Mac, then `moi status` — the service must be running again.
- Log out/in instead of a reboot for a faster login-start check.

## Report format

One table: step → PASS/FAIL/PENDING + a one-line note. Below it: the
preflight record, the plist env key list actually captured, and full output
of any FAIL. Send the report before doing step 9's restore, in case the user
wants to poke at the live state.
