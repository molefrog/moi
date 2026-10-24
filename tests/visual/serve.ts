// Serves moi for the visual tests the way a release does: the prebuilt client
// from dist/ (built with the /dev playground kept in), not the live dev
// bundler, whose output can differ from one start to the next. The server
// gets its own data dir and home, so the machine's workspaces and agent
// history never reach a capture. It registers two workspaces under fixed ids,
// builds the seeded one's widgets and view with moi's own CLI, and prints SERVER_READY once
// everything a test can open exists.
import { cp, mkdir, realpath, rm, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { BUILT_WORKSPACE, DEMO_WORKSPACE, SERVER_READY } from './demo-workspace'
import { CHAT_SESSION_ID, CHAT_TIME, chatSessionLines } from './seed/chat-session'

const stateDir = process.env.VISUAL_STATE_DIR
if (!stateDir) throw new Error('VISUAL_STATE_DIR is not set')

const root = join(import.meta.dir, '../..')
const cli = join(root, 'server/cli.ts')
const home = join(stateDir, 'home')
const env = {
  ...process.env,
  HOME: home,
  MOI_DATA_DIR: join(stateDir, 'data'),
  // Agent CLIs read these before HOME; pin them so a runner's real config is never used.
  CLAUDE_CONFIG_DIR: join(home, '.claude'),
  CODEX_HOME: join(home, '.codex')
}

function run(
  command: string[],
  options: { env?: Record<string, string | undefined>; cwd?: string } = {}
) {
  const { exitCode } = Bun.spawnSync(command, {
    env: options.env ?? env,
    cwd: options.cwd,
    stdout: 'inherit',
    stderr: 'inherit'
  })
  if (exitCode !== 0) process.exit(exitCode)
}

await rm(stateDir, { recursive: true, force: true })
const workspacePath = (id: string) => join(home, 'projects', id)

// run.ts builds the client once for all of its servers and sets this.
const clientBuilt = process.env.VISUAL_CLIENT_BUILT === '1'
if (!clientBuilt) {
  run(['bun', join(root, 'scripts/build-client.ts')], { env: { ...env, MOI_DEV_ROUTES: 'true' } })
}
for (const id of [DEMO_WORKSPACE, BUILT_WORKSPACE]) {
  await mkdir(workspacePath(id), { recursive: true })
  run(['bun', cli, 'init', workspacePath(id), '--harness', 'claude-code', '--id', id])
}

const built = workspacePath(BUILT_WORKSPACE)
await cp(join(import.meta.dir, 'seed', BUILT_WORKSPACE), built, { recursive: true })
// Stored under another name: the repo's .gitignore drops every `.env`.
await cp(join(import.meta.dir, 'seed', `${BUILT_WORKSPACE}.env`), join(built, '.env'))
// Claude names a workspace's session folder after its resolved path (macOS
// /tmp is /private/tmp), every non-alphanumeric character turned into `-`.
const sessionFolder = (await realpath(built)).replaceAll(/[^a-zA-Z0-9]/g, '-')
const sessions = join(env.CLAUDE_CONFIG_DIR, 'projects', sessionFolder)
await mkdir(sessions, { recursive: true })
const sessionFile = join(sessions, `${CHAT_SESSION_ID}.jsonl`)
await writeFile(sessionFile, chatSessionLines(built))
await utimes(sessionFile, CHAT_TIME, CHAT_TIME)

const server = Bun.spawn(['bun', cli, 'start'], { env, stdout: 'inherit', stderr: 'inherit' })
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.kill(signal))
}

const configUrl = `http://127.0.0.1:${process.env.PORT}/api/config`
while (
  !(await fetch(configUrl)
    .then(r => r.ok)
    .catch(() => false))
)
  await Bun.sleep(100)
run(['bun', cli, 'bundle'], { cwd: built })
console.log(SERVER_READY)

const exitCode = await server.exited
// Any later non-dev `moi start` from this checkout would serve a leftover
// dist/ (see AGENTS.md).
if (!clientBuilt) await rm(join(root, 'dist'), { recursive: true, force: true })
process.exit(exitCode)
