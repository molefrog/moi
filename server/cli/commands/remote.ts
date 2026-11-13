import { defineCommand } from 'citty'
import open from 'open'
import { remoteOperations } from '../remote-operations'
import { clearLine, cursorTo } from 'node:readline'
import { createInterface } from 'node:readline/promises'
import {
  currentRemoteWorkspace,
  linkRemoteWorkspace,
  unlinkRemoteWorkspace
} from '../../remote/workspace'
import pc from '../pc'
import {
  login as signIn,
  logout as signOut,
  CloudSignInRequired,
  remoteConfig,
  remoteStatus,
  invitations as listInvitations,
  accept as acceptInvitation,
  joinAgent,
  renameAgent,
  leave as leaveWorkspace
} from '../../remote/client'

// Profile fields are user supplied; they must not control the terminal.
// oxlint-disable-next-line no-control-regex -- Deliberately remove terminal control characters.
const text = (value: string) => Bun.stripANSI(value).replace(/[\u0000-\u001f\u007f-\u009f]/g, '')

async function reportErrors(action: () => Promise<void>): Promise<void> {
  try {
    await action()
  } catch (error) {
    if (
      error instanceof CloudSignInRequired ||
      (error instanceof Error && error.message === 'Not signed in — run moi remote login')
    ) {
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
    browser: {
      type: 'boolean',
      default: true,
      description: 'Open the login page (use --no-browser to print its URL only)'
    }
  },
  async run({ args }) {
    await reportErrors(async () => {
      let stopWaiting = () => {}
      try {
        await signIn(async (url, code) => {
          console.log(`\nVisit ${pc.bold(url)}\nCode: ${text(code)}\n`)
          if (args.browser) await open(url).catch(() => {})
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
  args: { yes: { type: 'boolean', description: 'Confirm permanently revoking this agent login' } },
  async run({ args }) {
    await reportErrors(async () => {
      await signOut(args.yes)
      console.log(`${pc.green('✓')} Signed out`)
    })
  }
})

const jsonArg = { type: 'boolean' as const, description: 'Print JSON' }
const pathArg = {
  type: 'string' as const,
  description: 'Local workspace folder (defaults to current folder)'
}
const ownerArg = { type: 'string' as const, description: 'Workspace owner user ID' }
const workspaceArg = { type: 'string' as const, description: 'Original workspace ID' }
const join = defineCommand({
  meta: { name: 'join', description: 'Join an invited workspace as an agent' },
  args: {
    invite: { type: 'positional', required: true },
    name: { type: 'string' },
    client: { type: 'string' },
    json: jsonArg
  },
  async run({ args }) {
    await reportErrors(async () => {
      const result = await joinAgent(args.invite, args.name, args.client)
      console.log(args.json ? JSON.stringify(result) : 'Joined the workspace')
    })
  }
})
const rename = defineCommand({
  meta: { name: 'rename-agent', description: 'Change your agent name across workspaces' },
  args: { name: { type: 'positional', required: true }, json: jsonArg },
  async run({ args }) {
    await reportErrors(async () => {
      const result = await renameAgent(args.name)
      console.log(args.json ? JSON.stringify(result) : `Agent renamed to ${text(result.name)}`)
    })
  }
})
const invitations = defineCommand({
  meta: { name: 'invitations', description: 'List pending workspace invitations' },
  args: { json: jsonArg },
  async run({ args }) {
    await reportErrors(async () => {
      const result = await listInvitations()
      if (args.json) console.log(JSON.stringify(result))
      else if (!result.length) console.log('No pending invitations')
      else
        for (const invitation of result)
          console.log(
            `${text(invitation.id)}  ${text(invitation.workspaceName)} — ${text(invitation.inviter.name)}`
          )
    })
  }
})
const accept = defineCommand({
  meta: { name: 'accept', description: 'Accept a human workspace invitation' },
  args: { invite: { type: 'positional', required: true }, json: jsonArg },
  async run({ args }) {
    await reportErrors(async () => {
      const result = await acceptInvitation(args.invite)
      console.log(args.json ? JSON.stringify(result) : 'Invitation accepted')
    })
  }
})
const link = defineCommand({
  meta: { name: 'link', description: 'Link a folder to a shared workspace' },
  args: { 'owner-id': ownerArg, 'workspace-id': workspaceArg, path: pathArg, json: jsonArg },
  async run({ args }) {
    await reportErrors(async () => {
      let owner = args['owner-id'],
        workspace = args['workspace-id']
      if (Boolean(owner) !== Boolean(workspace))
        throw new Error('Provide both --owner-id and --workspace-id')
      if (!owner || !workspace) {
        const status = await remoteStatus()
        if (!('email' in status.me) || !process.stdin.isTTY || !process.stdout.isTTY)
          throw new Error('Provide --owner-id and --workspace-id in noninteractive or agent mode')
        if (!status.workspaces.length) throw new Error('No shared workspaces available')
        status.workspaces.forEach((w, i) =>
          console.log(`${i + 1}. ${text(w.owner.name)} — ${text(w.id)}`)
        )
        const prompt = createInterface({ input: process.stdin, output: process.stdout })
        try {
          const choice = Number(await prompt.question('Select a workspace: '))
          const selected = Number.isInteger(choice) ? status.workspaces[choice - 1] : undefined
          if (!selected) throw new Error('Invalid workspace selection')
          owner = selected.owner.id
          workspace = selected.id
        } finally {
          prompt.close()
        }
      }
      const result = await linkRemoteWorkspace(args.path ?? process.cwd(), {
        user_id: owner,
        workspace_id: workspace
      })
      console.log(
        args.json
          ? JSON.stringify(result)
          : `Linked ${text(result.path)} to ${text(owner)}:${text(workspace)}`
      )
    })
  }
})
const unlink = defineCommand({
  meta: { name: 'unlink', description: 'Unlink this folder; keep cloud membership' },
  args: { path: pathArg, json: jsonArg },
  async run({ args }) {
    await reportErrors(async () => {
      const result = await unlinkRemoteWorkspace(args.path)
      console.log(args.json ? JSON.stringify(result) : 'Folder unlinked; cloud membership kept')
    })
  }
})
const leave = defineCommand({
  meta: { name: 'leave', description: 'Leave a shared workspace; keep local files' },
  args: { 'owner-id': ownerArg, 'workspace-id': workspaceArg, path: pathArg, json: jsonArg },
  async run({ args }) {
    await reportErrors(async () => {
      const current = args['owner-id'] ? undefined : await currentRemoteWorkspace(args.path)
      const owner = args['owner-id'] ?? current?.user_id,
        workspace = args['workspace-id'] ?? current?.workspace_id
      if (Boolean(args['owner-id']) !== Boolean(args['workspace-id']))
        throw new Error('Provide both --owner-id and --workspace-id')
      if (!owner || !workspace)
        throw new Error('No linked workspace — provide --owner-id and --workspace-id')
      const result = await leaveWorkspace(owner, workspace)
      console.log(args.json ? JSON.stringify(result) : 'Left the workspace; local files kept')
    })
  }
})
const remoteSubCommands = {
  ...remoteOperations(reportErrors),
  login,
  logout,
  join,
  'rename-agent': rename,
  invitations,
  accept,
  link,
  unlink,
  leave
}

export const remote = defineCommand({
  meta: { name: 'remote', description: 'Show your cloud account and shared workspaces' },
  args: { json: jsonArg, path: pathArg },
  subCommands: remoteSubCommands,
  async run({ args, rawArgs }) {
    // citty also runs the parent after a subcommand; only bare `remote` shows status.
    const sub = rawArgs.find(arg => !arg.startsWith('-'))
    if (sub && Object.hasOwn(remoteSubCommands, sub)) return
    await reportErrors(async () => {
      const status = {
        ...(await remoteStatus()),
        currentWorkspace: await currentRemoteWorkspace(args.path)
      }
      if (args.json) {
        console.log(JSON.stringify(status, null, 2))
        return
      }
      console.log(
        `\n${text(status.me.name || ('email' in status.me ? status.me.email : status.me.client))} <${text('email' in status.me ? status.me.email : status.me.client)}>\nAccount: ${text(status.me.id)}\nCloud: ${(await remoteConfig()).url}\n`
      )
      if (status.currentWorkspace)
        console.log(
          `Linked workspace: ${text(status.currentWorkspace.user_id)}:${text(status.currentWorkspace.workspace_id)}\n`
        )
      console.log('Shared workspaces')
      if (!status.workspaces.length) console.log('  No shared workspaces')
      for (const workspace of status.workspaces)
        console.log(
          `  ${text(workspace.id)}  — ${text(workspace.owner.name || workspace.owner.email)} <${text(workspace.owner.email)}>\n    Owner ID: ${text(workspace.owner.id)}`
        )
      console.log()
    })
  }
})
