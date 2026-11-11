import { defineCommand } from 'citty'
import open from 'open'
import { clearLine, cursorTo } from 'node:readline'
import pc from '../pc'
import { login as signIn, logout as signOut, remoteConfig, remoteStatus } from '../../remote/client'

// Profile fields are user supplied; they must not control the terminal.
// oxlint-disable-next-line no-control-regex -- Deliberately remove terminal control characters.
const text = (value: string) => Bun.stripANSI(value).replace(/[\u0000-\u001f\u007f-\u009f]/g, '')

async function reportErrors(action: () => Promise<void>): Promise<void> {
  try {
    await action()
  } catch (error) {
    if (error instanceof Error && error.message === 'Not signed in — run moi remote login') {
      console.error(`${pc.dim('›')} Signed out`)
      console.error(
        pc.dim('› Run ') + pc.cyan('moi remote login') + pc.dim(' to connect to Moi Cloud')
      )
    } else {
      console.error(error instanceof Error ? error.message : 'Cloud request failed')
    }
    process.exitCode = 1
  }
}

function waitingForLogin(): () => void {
  const message = 'Waiting for authentication…'
  if (!process.stderr.isTTY) {
    console.error(message)
    return () => {}
  }
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
  let frame = 0
  const draw = () => {
    cursorTo(process.stderr, 0)
    process.stderr.write(pc.dim(`${frames[frame++ % frames.length]} ${message}`))
  }
  draw()
  const timer = setInterval(draw, 80)
  const stop = () => {
    clearInterval(timer)
    clearLine(process.stderr, 0)
    cursorTo(process.stderr, 0)
    process.removeListener('SIGINT', interrupt)
  }
  const interrupt = () => {
    stop()
    process.exit(130)
  }
  process.once('SIGINT', interrupt)
  return stop
}

const login = defineCommand({
  meta: { name: 'login', description: 'Sign in to Moi Cloud in your browser' },
  args: {
    'no-browser': { type: 'boolean', description: 'Print the login link without opening a browser' }
  },
  async run({ args }) {
    await reportErrors(async () => {
      let stopWaiting = () => {}
      try {
        await signIn(async (url, code) => {
          console.log(`\nVisit ${pc.bold(url)}\nCode: ${text(code)}\n`)
          if (!args['no-browser']) await open(url).catch(() => {})
          stopWaiting = waitingForLogin()
        })
      } finally {
        stopWaiting()
      }
      console.log(`\n${pc.green('Congratulations!')} You are now signed in.\n`)
    })
  }
})

const logout = defineCommand({
  meta: { name: 'logout', description: 'Sign out of Moi Cloud' },
  async run() {
    await reportErrors(async () => {
      await signOut()
      console.log(`${pc.green('✓')} Signed out`)
    })
  }
})

const remoteSubCommands = { login, logout }

export const remote = defineCommand({
  meta: { name: 'remote', description: 'Show your cloud account and shared workspaces' },
  args: { json: { type: 'boolean', description: 'Print the account and workspaces as JSON' } },
  subCommands: remoteSubCommands,
  async run({ args, rawArgs }) {
    // citty also runs the parent after a subcommand; only bare `remote` shows status.
    const sub = rawArgs.find(arg => !arg.startsWith('-'))
    if (sub && Object.hasOwn(remoteSubCommands, sub)) return
    await reportErrors(async () => {
      const status = await remoteStatus()
      if (args.json) {
        console.log(JSON.stringify(status, null, 2))
        return
      }
      console.log(
        `\n${text(status.me.name || status.me.email)} <${text(status.me.email)}>\nAccount: ${text(status.me.id)}\nCloud: ${(await remoteConfig()).url}\n`
      )
      console.log('Shared workspaces')
      if (!status.workspaces.length) console.log('  No shared workspaces')
      for (const workspace of status.workspaces)
        console.log(
          `  ${text(workspace.id)}  — ${text(workspace.owner.name || workspace.owner.email)} <${text(workspace.owner.email)}>`
        )
      console.log()
    })
  }
})
