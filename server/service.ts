// `moi service` mechanics: run the moi server as a user-level service that
// starts on login, restarts on crash, and survives reboots — launchd on macOS,
// a systemd user unit on Linux, no third-party process manager.
//
// The unit execs the `moi` bin from PATH directly (not via a launcher): bin
// links survive package updates under every package manager, the shebang/shim
// resolves `bun` from the captured PATH, and with MOI_SERVER=1 in the unit env
// the launched process IS the server — so the service manager supervises the
// real thing, not a wrapper that spawned it.
//
// The environment is captured once, at install time (decided in the RFC — no
// runtime env file), and it is an ALLOWLIST, not a shell snapshot: PATH plus
// system basics, proxy settings, and moi/agent vars. The server itself reads
// almost nothing ambient, agent secrets have a proper channel (workspace env
// overlays every agent session), and anything custom can be captured by name
// with `moi service install --env KEY`. PATH is handled deliberately — the
// running bun's dir is prepended so the unit always finds the interpreter
// that installed it.
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, rm, stat, truncate, writeFile } from 'node:fs/promises'
import { homedir, userInfo } from 'node:os'
import { dirname, join } from 'node:path'

import { CONTROL_PORT } from './constants'
import { DATA_DIR } from './data-dir'
import { mergeSearchPaths } from './harness/shell-path'
import { PACKAGE_ROOT } from './version'

// ---- identity ---------------------------------------------------------------

export const LAUNCHD_LABEL = 'computer.moi.server'
export const SYSTEMD_UNIT = 'moi.service'

export type ServicePlatform = 'darwin' | 'linux'

export function servicePlatform(): ServicePlatform {
  if (process.platform === 'darwin' || process.platform === 'linux') return process.platform
  throw new Error(`moi service supports macOS and Linux (this is ${process.platform}).`)
}

export function serviceUnitPath(platform: ServicePlatform = servicePlatform()): string {
  if (platform === 'darwin') {
    return join(homedir(), 'Library', 'LaunchAgents', `${LAUNCHD_LABEL}.plist`)
  }
  const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), '.config')
  return join(configHome, 'systemd', 'user', SYSTEMD_UNIT)
}

// Server stdout/stderr under launchd (systemd captures to the journal instead).
// Lives in the moi data dir so `MOI_DATA_DIR` isolates tests.
export function serviceLogPath(): string {
  return join(DATA_DIR, 'logs', 'server.log')
}

// ---- install analysis -------------------------------------------------------

export type InstallAnalysis =
  | { kind: 'global'; root: string; bin: string }
  | { kind: 'checkout'; root: string; reason: string }
  | { kind: 'no-bin'; root: string }

// A service (and `moi update`) only makes sense for a real global install: a
// published package ships a prebuilt client in `dist/` and no `.git`, and its
// `moi` bin resolves on PATH. A source checkout or `bun link` fails these
// checks and is refused with the reason.
export function analyzeInstall(
  root: string = PACKAGE_ROOT,
  which: (cmd: string) => string | null = cmd => Bun.which(cmd)
): InstallAnalysis {
  if (existsSync(join(root, '.git'))) {
    return { kind: 'checkout', root, reason: 'git checkout' }
  }
  if (!existsSync(join(root, 'dist', 'index.html'))) {
    return { kind: 'checkout', root, reason: 'no prebuilt client in dist/' }
  }
  const bin = which('moi')
  if (!bin) return { kind: 'no-bin', root }
  return { kind: 'global', root, bin }
}

// ---- environment capture ----------------------------------------------------

// What the unit captures is an allowlist, not a shell snapshot. The server's
// own code reads almost nothing ambient (HOME, PATH, XDG dirs), agent secrets
// have a proper channel (workspace env — `moi env`/.env — overlays every
// agent session), and a full snapshot would bake every exported shell secret
// and per-session value into a file that outlives them. Notably absent on
// purpose: HOST/PORT/HOSTNAME (shells export these; they would redirect the
// server bind), SSH_AUTH_SOCK (per-boot socket; launchd provides a fresh one
// anyway), and terminal/session state. Custom vars are captured by name via
// `moi service install --env KEY`.
const ENV_ALLOW = new Set([
  // System identity and locale — agents and tools misbehave without them.
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'TMPDIR',
  'LANG',
  'TZ',
  // Stable XDG dirs (never the per-boot XDG_RUNTIME_DIR / XDG_SESSION_*).
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'XDG_STATE_HOME',
  'XDG_CACHE_HOME',
  // Networking: proxies and corporate CA bundles, both cases.
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'ALL_PROXY',
  'http_proxy',
  'https_proxy',
  'no_proxy',
  'all_proxy',
  'NODE_EXTRA_CA_CERTS',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR'
])

// moi itself, the agent harnesses, and their runtimes. CLAUDE_* is
// deliberately NOT here: `moi service install` is often run by a Claude Code
// agent, and capturing that session's runtime vars (CLAUDE_CODE_CHILD_SESSION
// and friends) would bake "you are inside a Claude Code session" into the
// daemon permanently, skewing every agent it spawns. Config-style CLAUDE_*
// vars can be captured explicitly with --env.
const ENV_ALLOW_PREFIXES = ['MOI_', 'ANTHROPIC_', 'OPENCLAW_', 'OPENAI_', 'PUBLIC_', 'BUN_', 'LC_']

// Runtime flags the unit stamps itself — never inherited from the installing
// shell (a dev shell must not bake MOI_DEV into the service).
const ENV_OWNED = new Set(['MOI_SERVER', 'MOI_SERVICE', 'MOI_DEV', 'MOI_DEBUG'])

const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

// A value the unit formats can hold: no control characters (unit files are
// line-based, plists are XML, and things like LESS_TERMCAP_* carry raw ESC).
function capturableValue(value: string | undefined): value is string {
  // eslint-disable-next-line no-control-regex
  return value !== undefined && value !== '' && !/[\0-\x1f\x7f]/.test(value)
}

// Build the unit environment: the allowlist above, plus any extra keys the
// user named at install time (still read from the installing shell — captured
// at install, no runtime env file). PATH gets the running bun's dir
// prepended, and MOI_SERVER/MOI_SERVICE mark the process as the
// service-managed server.
export function captureServiceEnv(
  base: Record<string, string | undefined> = process.env,
  execDir: string = dirname(process.execPath),
  extraKeys: string[] = []
): Record<string, string> {
  const extras = new Set(extraKeys)
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(base)) {
    if (!ENV_KEY_RE.test(key)) continue
    if (ENV_OWNED.has(key)) continue
    const allowed =
      ENV_ALLOW.has(key) || extras.has(key) || ENV_ALLOW_PREFIXES.some(p => key.startsWith(p))
    if (!allowed) continue
    if (!capturableValue(value)) continue
    env[key] = value
  }
  env.PATH = mergeSearchPaths(execDir, base.PATH)
  env.MOI_SERVER = '1'
  env.MOI_SERVICE = '1'
  return env
}

// ---- unit file generation ---------------------------------------------------

export type ServiceSpec = {
  // Absolute path of the `moi` bin the unit execs (from PATH, stable across
  // package updates).
  bin: string
  env: Record<string, string>
  // Working directory: a neutral, stable dir (home) — never the install tree,
  // which package managers replace on update (see server-cwd.ts).
  cwd: string
  logPath: string
}

function xmlEscape(s: string): string {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

// launchd user agent. ProgramArguments execs the moi bin directly — argv[0]'s
// basename is what macOS shows as the login item, so wrapping in /bin/sh
// would surface an anonymous "sh" entry (verified on a real Mac). The
// missing-interpreter case (bun moved/uninstalled → shebang dies with 127) is
// therefore a throttled respawn, not a graceful idle: ThrottleInterval=60
// caps it at one attempt a minute, and `moi service` status flags a unit PATH
// with no bun on it — accepted residual.
//
// KeepAlive.SuccessfulExit=false means: restart on crash (non-zero exit),
// stop respawning after a deliberate exit 0 — which is how the server signals
// a permanent startup failure (port taken, config error) under MOI_SERVICE,
// so a broken unit idles instead of respawn-looping.
export function launchdPlist(spec: ServiceSpec): string {
  const envEntries = Object.keys(spec.env)
    .sort()
    .map(
      key => `\t\t<key>${xmlEscape(key)}</key>\n\t\t<string>${xmlEscape(spec.env[key])}</string>`
    )
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>Label</key>
\t<string>${LAUNCHD_LABEL}</string>
\t<key>ProgramArguments</key>
\t<array>
\t\t<string>${xmlEscape(spec.bin)}</string>
\t\t<string>start</string>
\t</array>
\t<key>RunAtLoad</key>
\t<true/>
\t<key>KeepAlive</key>
\t<dict>
\t\t<key>SuccessfulExit</key>
\t\t<false/>
\t</dict>
\t<key>ThrottleInterval</key>
\t<integer>60</integer>
\t<key>WorkingDirectory</key>
\t<string>${xmlEscape(spec.cwd)}</string>
\t<key>StandardOutPath</key>
\t<string>${xmlEscape(spec.logPath)}</string>
\t<key>StandardErrorPath</key>
\t<string>${xmlEscape(spec.logPath)}</string>
\t<key>ExitTimeOut</key>
\t<integer>15</integer>
\t<key>EnvironmentVariables</key>
\t<dict>
${envEntries}
\t</dict>
</dict>
</plist>
`
}

// systemd quoting: values live inside "…" where `\` and `"` are escaped, and
// `%` doubles so specifier expansion never fires on captured values.
function systemdQuote(s: string): string {
  return '"' + s.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('%', '%%') + '"'
}

// systemd user unit. Restart=on-failure restarts crashes but not the
// deliberate exit 0 the server uses for permanent startup failures, and the
// StartLimit gives up after 5 failed starts in 60s instead of looping forever
// (`moi service restart` resets the limit).
export function systemdUnit(spec: ServiceSpec): string {
  const envLines = Object.keys(spec.env)
    .sort()
    .map(key => `Environment=${systemdQuote(`${key}=${spec.env[key]}`)}`)
    .join('\n')
  return `[Unit]
Description=moi server

StartLimitIntervalSec=60
StartLimitBurst=5

[Service]
ExecStart=${systemdQuote(spec.bin)} start
WorkingDirectory=${spec.cwd}
Restart=on-failure
RestartSec=2
TimeoutStopSec=10
${envLines}

[Install]
WantedBy=default.target
`
}

function xmlUnescape(s: string): string {
  return s.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&')
}

function systemdUnquote(s: string): string {
  return s.replaceAll('%%', '%').replaceAll('\\"', '"').replaceAll('\\\\', '\\')
}

// Pull the exec path back out of a unit file this module wrote, to detect a
// captured bin that has gone stale (moved/uninstalled) in `moi service` status.
// darwin: the first ProgramArguments string; linux: the quoted ExecStart word.
export function parseUnitBin(content: string, platform: ServicePlatform): string | null {
  if (platform === 'darwin') {
    const m = content.match(/<key>ProgramArguments<\/key>\s*<array>\s*<string>([^<]*)<\/string>/)
    return m ? xmlUnescape(m[1]) : null
  }
  const m = content.match(/^ExecStart="(.*)" start$/m)
  return m ? systemdUnquote(m[1]) : null
}

// The PATH the unit will hand the server, read back out of the unit file —
// so status can tell when no `bun` remains anywhere on it (the moi bin's
// `#!/usr/bin/env bun` then dies at exec, before any moi code runs).
export function parseUnitSearchPath(content: string, platform: ServicePlatform): string | null {
  if (platform === 'darwin') {
    const m = content.match(/<key>PATH<\/key>\s*<string>([^<]*)<\/string>/)
    return m ? xmlUnescape(m[1]) : null
  }
  const m = content.match(/^Environment="PATH=(.*)"$/m)
  return m ? systemdUnquote(m[1]) : null
}

export function bunOnSearchPath(searchPath: string): boolean {
  return searchPath.split(':').some(dir => dir && existsSync(join(dir, 'bun')))
}

// ---- process helpers --------------------------------------------------------

type RunResult = { code: number; stdout: string; stderr: string }

async function run(cmd: string[]): Promise<RunResult> {
  try {
    const proc = Bun.spawn(cmd, { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' })
    const [code, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text()
    ])
    return { code, stdout, stderr }
  } catch (err) {
    // Spawn itself failed — the binary (launchctl/systemctl/…) is missing.
    return { code: 127, stdout: '', stderr: String(err) }
  }
}

function uid(): number {
  return process.getuid?.() ?? 0
}

function username(): string {
  try {
    return userInfo().username
  } catch {
    return process.env.USER ?? ''
  }
}

// ---- running-server introspection -------------------------------------------

export type ServerInfo = { version: string; pid: number; port: number; service: boolean }

// Ask the running server who it is over the control port. Resolves null when
// no server is up — or when an older server (without `server:info`) is; pair
// with a plain connect check to tell those apart.
export function queryServerInfo(timeoutMs = 1500): Promise<ServerInfo | null> {
  return new Promise(resolvePromise => {
    let settled = false
    const settle = (value: ServerInfo | null) => {
      if (settled) return
      settled = true
      resolvePromise(value)
    }
    let ws: WebSocket
    try {
      ws = new WebSocket(`ws://localhost:${CONTROL_PORT}`)
    } catch {
      settle(null)
      return
    }
    const timer = setTimeout(() => {
      try {
        ws.close()
      } catch {}
      settle(null)
    }, timeoutMs)
    ws.onopen = () => ws.send(JSON.stringify({ type: 'server:info' }))
    ws.onmessage = event => {
      clearTimeout(timer)
      try {
        const data = JSON.parse(String(event.data)) as Partial<ServerInfo>
        if (typeof data.version === 'string') {
          settle({
            version: data.version,
            pid: typeof data.pid === 'number' ? data.pid : 0,
            port: typeof data.port === 'number' ? data.port : 0,
            service: data.service === true
          })
        } else {
          settle(null)
        }
      } catch {
        settle(null)
      }
      ws.close()
    }
    ws.onerror = () => {
      clearTimeout(timer)
      settle(null)
    }
  })
}

// Poll until the (re)started server answers `server:info`, or time runs out.
// `ignorePid` skips replies from the outgoing server: launchd's kickstart -k
// kills asynchronously, so right after a restart the old process can still be
// draining on the control port — its answer must not pass for the new one.
export async function waitForServerInfo(
  timeoutMs = 12_000,
  ignorePid?: number
): Promise<ServerInfo | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const info = await queryServerInfo(900)
    if (info && (ignorePid === undefined || info.pid !== ignorePid)) return info
    await Bun.sleep(300)
  }
  return null
}

// ---- linux user-manager + linger --------------------------------------------

// A systemd *user* manager only runs inside a logind session (or with
// lingering enabled). Without one, every `systemctl --user` call fails with a
// bus error — detect that up front so install can explain instead of spraying
// raw dbus errors.
export async function userManagerAvailable(): Promise<boolean> {
  const res = await run(['systemctl', '--user', 'is-system-running'])
  const out = (res.stdout + res.stderr).trim()
  return /\b(running|degraded|starting|initializing|maintenance)\b/.test(out)
}

export type LingerState = 'enabled' | 'disabled' | 'unknown'

// Without lingering, a user's services stop when their last login session ends
// — on a headless box the service would die with the SSH session.
export async function lingerState(): Promise<LingerState> {
  const user = username()
  if (!user) return 'unknown'
  const res = await run(['loginctl', 'show-user', user, '--property=Linger'])
  if (res.code !== 0) return 'unknown'
  if (res.stdout.includes('Linger=yes')) return 'enabled'
  if (res.stdout.includes('Linger=no')) return 'disabled'
  return 'unknown'
}

export async function tryEnableLinger(): Promise<boolean> {
  // Self-linger needs no root on stock polkit; failure is surfaced as a hint,
  // not an error — the service still works for logged-in sessions.
  const res = await run(['loginctl', 'enable-linger'])
  if (res.code !== 0) return false
  return (await lingerState()) === 'enabled'
}

// ---- service state ----------------------------------------------------------

export type ServiceRuntime = {
  // Loaded/active state as one human-readable word: 'running', 'idle',
  // 'failed', 'not-loaded', 'unavailable' (no user manager).
  state: string
  pid: number | null
  detail: string | null
}

// Parse `launchctl print` output. States can be multi-word (`not running`,
// `spawn scheduled`), so capture to end of line; `not running` maps onto this
// module's 'idle' vocabulary.
export function parseLaunchdPrint(stdout: string): ServiceRuntime {
  const pid = stdout.match(/\bpid = (\d+)/)
  const state = stdout.match(/\bstate = ([^\n]+)/)
  const raw = state?.[1].trim()
  return {
    state: raw === 'not running' ? 'idle' : (raw ?? (pid ? 'running' : 'idle')),
    pid: pid ? Number(pid[1]) : null,
    detail: null
  }
}

export async function serviceRuntime(
  platform: ServicePlatform = servicePlatform()
): Promise<ServiceRuntime> {
  if (platform === 'darwin') {
    const res = await run(['launchctl', 'print', `gui/${uid()}/${LAUNCHD_LABEL}`])
    if (res.code !== 0) return { state: 'not-loaded', pid: null, detail: null }
    return parseLaunchdPrint(res.stdout)
  }
  if (!(await userManagerAvailable())) {
    return { state: 'unavailable', pid: null, detail: 'systemd user manager is not running' }
  }
  const res = await run([
    'systemctl',
    '--user',
    'show',
    SYSTEMD_UNIT,
    '--property=ActiveState,SubState,MainPID,NRestarts'
  ])
  const props = new Map(
    res.stdout
      .split('\n')
      .map(line => line.split('=', 2) as [string, string])
      .filter(pair => pair.length === 2)
  )
  const active = props.get('ActiveState') ?? 'unknown'
  const sub = props.get('SubState') ?? ''
  const mainPid = Number(props.get('MainPID') ?? 0)
  const restarts = Number(props.get('NRestarts') ?? 0)
  const state = active === 'active' ? 'running' : active === 'failed' ? 'failed' : active
  return {
    state,
    pid: mainPid > 0 ? mainPid : null,
    detail:
      (sub && sub !== 'running' ? sub : null) &&
      `${sub}${restarts > 0 ? `, ${restarts} restarts` : ''}`
  }
}

// ---- install / uninstall / restart ------------------------------------------

export class ServiceError extends Error {}

async function writeUnit(platform: ServicePlatform, content: string): Promise<string> {
  const unitPath = serviceUnitPath(platform)
  await mkdir(dirname(unitPath), { recursive: true })
  // 0600: the captured environment can contain secrets (API keys).
  await writeFile(unitPath, content, { mode: 0o600 })
  return unitPath
}

// Write the unit, run the activation commands, and put things back on
// failure: a failed fresh install must not leave a half-installed unit behind
// (status would claim "installed" for a service that never activated), and a
// failed reinstall must not destroy the previous working unit.
async function writeUnitWithRollback(
  platform: ServicePlatform,
  content: string,
  activate: () => Promise<void>
): Promise<string> {
  const unitPath = serviceUnitPath(platform)
  let previous: string | null = null
  try {
    previous = await readFile(unitPath, 'utf8')
  } catch {}
  await writeUnit(platform, content)
  try {
    await activate()
  } catch (err) {
    if (previous === null) await rm(unitPath, { force: true })
    else await writeFile(unitPath, previous, { mode: 0o600 })
    throw err
  }
  return unitPath
}

export type InstallResult = {
  unitPath: string
  logPath: string | null
  info: ServerInfo | null
  notes: string[]
}

export async function installService(
  opts: { port?: number; extraEnv?: string[] } = {}
): Promise<InstallResult> {
  const platform = servicePlatform()
  // A reinstall replaces a running service server — remember its pid so the
  // up-again poll below never mistakes the outgoing process for the new one.
  const before = await queryServerInfo()
  const analysis = analyzeInstall()
  if (analysis.kind === 'checkout') {
    throw new ServiceError(
      `moi service needs a global install, not a source tree (${analysis.reason}).\n` +
        `  Install one with: bun i -g moi-computer  — then rerun from that \`moi\`.`
    )
  }
  if (analysis.kind === 'no-bin') {
    throw new ServiceError(
      'The `moi` command is not on PATH — the service execs it directly.\n' +
        '  Install with: bun i -g moi-computer'
    )
  }

  const extraEnv = opts.extraEnv ?? []
  const env = captureServiceEnv(process.env, dirname(process.execPath), extraEnv)
  // A key asked for by name must actually land — silently baking nothing
  // would read as "captured" until the agent fails weeks later.
  const missing = extraEnv.filter(key => !(key in env))
  if (missing.length > 0) {
    throw new ServiceError(
      `--env ${missing.join(', ')}: not set in this shell (or the value is not capturable).`
    )
  }
  if (opts.port) env.PORT = String(opts.port)
  const spec: ServiceSpec = {
    bin: analysis.bin,
    env,
    cwd: homedir(),
    logPath: serviceLogPath()
  }

  const notes: string[] = []

  if (platform === 'darwin') {
    await mkdir(dirname(spec.logPath), { recursive: true })
    const unitPath = serviceUnitPath(platform)
    await writeUnitWithRollback(platform, launchdPlist(spec), async () => {
      const domain = `gui/${uid()}`
      // Reinstall: drop any loaded copy first so bootstrap reads the new plist.
      await run(['launchctl', 'bootout', `${domain}/${LAUNCHD_LABEL}`])
      // Clear a leftover `launchctl disable` so bootstrap isn't refused.
      await run(['launchctl', 'enable', `${domain}/${LAUNCHD_LABEL}`])
      const boot = await run(['launchctl', 'bootstrap', domain, unitPath])
      if (boot.code !== 0) {
        throw new ServiceError(
          `launchctl bootstrap failed (${boot.stderr.trim() || `exit ${boot.code}`})`
        )
      }
    })
    notes.push('macOS may report a new login item named "moi" — that is this service.')
    const info = await waitForServerInfo(12_000, before?.pid)
    return { unitPath, logPath: spec.logPath, info, notes }
  }

  // linux
  if (!(await userManagerAvailable())) {
    throw new ServiceError(
      'No systemd user manager is running for this account.\n' +
        `  On a headless machine enable lingering first: sudo loginctl enable-linger ${username()}\n` +
        '  then log in again and rerun `moi service install`.'
    )
  }
  const unitPath = serviceUnitPath(platform)
  await writeUnitWithRollback(platform, systemdUnit(spec), async () => {
    await run(['systemctl', '--user', 'daemon-reload'])
    await run(['systemctl', '--user', 'reset-failed', SYSTEMD_UNIT])
    const enable = await run(['systemctl', '--user', 'enable', SYSTEMD_UNIT])
    if (enable.code !== 0) {
      throw new ServiceError(
        `systemctl enable failed (${enable.stderr.trim() || `exit ${enable.code}`})`
      )
    }
    // `restart`, not `enable --now`: start on an already-active unit is a
    // no-op, so a reinstall over a running service would keep the old process
    // (old env/port/bin). restart starts an inactive unit and replaces an
    // active one.
    const start = await run(['systemctl', '--user', 'restart', SYSTEMD_UNIT])
    if (start.code !== 0) {
      throw new ServiceError(
        `systemctl restart failed (${start.stderr.trim() || `exit ${start.code}`})`
      )
    }
  })
  if ((await lingerState()) !== 'enabled') {
    if (await tryEnableLinger()) {
      notes.push('Lingering enabled — the service keeps running after you log out.')
    } else {
      notes.push(
        `Lingering is off: the service stops when your last session ends.\n` +
          `  Enable it with: loginctl enable-linger  (or: sudo loginctl enable-linger ${username()})`
      )
    }
  }
  const info = await waitForServerInfo(12_000, before?.pid)
  return { unitPath, logPath: null, info, notes }
}

export async function uninstallService(): Promise<{ unitPath: string; existed: boolean }> {
  const platform = servicePlatform()
  const unitPath = serviceUnitPath(platform)
  const existed = existsSync(unitPath)
  if (platform === 'darwin') {
    await run(['launchctl', 'bootout', `gui/${uid()}/${LAUNCHD_LABEL}`])
    await rm(unitPath, { force: true })
    return { unitPath, existed }
  }
  // Best-effort even without a user manager — removing the unit file is what
  // stops it coming back.
  await run(['systemctl', '--user', 'disable', '--now', SYSTEMD_UNIT])
  await rm(unitPath, { force: true })
  await run(['systemctl', '--user', 'daemon-reload'])
  await run(['systemctl', '--user', 'reset-failed', SYSTEMD_UNIT])
  return { unitPath, existed }
}

export async function restartService(): Promise<ServerInfo | null> {
  const platform = servicePlatform()
  const unitPath = serviceUnitPath(platform)
  if (!existsSync(unitPath)) {
    throw new ServiceError('The service is not installed — run `moi service install` first.')
  }
  const before = await queryServerInfo()
  if (platform === 'darwin') {
    const domain = `gui/${uid()}`
    const kick = await run(['launchctl', 'kickstart', '-k', `${domain}/${LAUNCHD_LABEL}`])
    if (kick.code !== 0) {
      // Not loaded in this login session (e.g. installed long ago, then
      // bootout) — bootstrap it back in.
      const boot = await run(['launchctl', 'bootstrap', domain, unitPath])
      if (boot.code !== 0) {
        throw new ServiceError(
          `launchctl kickstart failed (${kick.stderr.trim() || `exit ${kick.code}`})`
        )
      }
    }
    return waitForServerInfo(12_000, before?.pid)
  }
  if (!(await userManagerAvailable())) {
    throw new ServiceError('No systemd user manager is running for this account.')
  }
  await run(['systemctl', '--user', 'reset-failed', SYSTEMD_UNIT])
  const res = await run(['systemctl', '--user', 'restart', SYSTEMD_UNIT])
  if (res.code !== 0) {
    throw new ServiceError(`systemctl restart failed (${res.stderr.trim() || `exit ${res.code}`})`)
  }
  return waitForServerInfo(12_000, before?.pid)
}

// ---- status assembly --------------------------------------------------------

export type ServiceStatus = {
  platform: ServicePlatform
  installed: boolean
  unitPath: string
  logPath: string | null
  runtime: ServiceRuntime | null
  // The bin the unit execs, and whether it still exists (a moved/reinstalled
  // moi leaves a stale unit behind).
  bin: string | null
  binMissing: boolean
  // No `bun` anywhere on the unit's captured PATH — the bin's shebang dies at
  // exec, so the service respawn-throttles without ever running moi code.
  bunMissing: boolean
  linger: LingerState | null
}

export async function serviceStatus(): Promise<ServiceStatus> {
  const platform = servicePlatform()
  const unitPath = serviceUnitPath(platform)
  const installed = existsSync(unitPath)
  let bin: string | null = null
  let binMissing = false
  let bunMissing = false
  if (installed) {
    try {
      const content = await readFile(unitPath, 'utf8')
      bin = parseUnitBin(content, platform)
      binMissing = bin !== null && !existsSync(bin)
      const searchPath = parseUnitSearchPath(content, platform)
      bunMissing = searchPath !== null && !bunOnSearchPath(searchPath)
    } catch {}
  }
  return {
    platform,
    installed,
    unitPath,
    logPath: platform === 'darwin' ? serviceLogPath() : null,
    runtime: installed ? await serviceRuntime(platform) : null,
    bin,
    binMissing,
    bunMissing,
    linger: platform === 'linux' ? await lingerState() : null
  }
}

// ---- launchd log rotation ---------------------------------------------------

// launchd redirects stdout/stderr to a file and never rotates it. The server
// rotates its own log with copy-then-truncate: launchd opens the file with
// O_APPEND, so writes after truncate land at the new end — no fd juggling.
// (systemd needs none of this; journald bounds the journal.)
export const SERVICE_LOG_MAX_BYTES = 5 * 1024 * 1024

export async function rotateServiceLog(logPath = serviceLogPath()): Promise<boolean> {
  try {
    const info = await stat(logPath)
    if (info.size <= SERVICE_LOG_MAX_BYTES) return false
    await copyFile(logPath, logPath + '.old')
    await truncate(logPath, 0)
    return true
  } catch {
    return false
  }
}

const LOG_ROTATION_CHECK_MS = 6 * 60 * 60 * 1000

// Called from server boot; a no-op unless this process is the service-managed
// server on macOS (the only setup that logs to a file).
export function startServiceLogMaintenance(): void {
  if (!process.env.MOI_SERVICE || process.platform !== 'darwin') return
  void rotateServiceLog()
  setInterval(() => void rotateServiceLog(), LOG_ROTATION_CHECK_MS).unref()
}
