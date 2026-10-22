import type { WorkspaceSkillStatus } from '@/lib/types'
import { defineCommand } from 'citty'
import { resolve } from 'path'
import { updateWorkspaceSkills } from '../../skills/update'
import type { WorkspaceSkillUpdateResult } from '../../skills/update'
import { displaySkillPath } from '../../skills/locations'
import { isBehind, isMinorBehind, resolveWorkspace, skillStatuses } from '../../skills/version'
import { dirArg } from '../args'
import pc from '../pc'
import { columns } from '../ui'

// Re-copy bundled skills into a workspace, then report what changed. Pure
// filesystem op — no running server needed. Resolves the workspace root the
// same way `moi bundle` does, so it works from `.moi/` or any subdirectory.
async function runSkillUpdate(cwd: string): Promise<void> {
  // Include the primary harness destination and existing copies for other agents.
  const { root, type } = await resolveWorkspace(cwd)
  const result = await updateWorkspaceSkills(root, type)
  const { changedSkills, updatedAppletTypes } = result
  const heading = changedSkills.length > 0 ? 'Skills updated in ' : 'Skills unchanged in '

  console.log('\n' + pc.green('✓') + ' ' + heading + pc.bold(root) + '\n')
  printSkillUpdateTable(root, result)
  for (const file of updatedAppletTypes) {
    console.log(pc.dim('  Applet types regenerated: ') + pc.bold(`.moi/${file}\n`))
  }
}

function printSkillUpdateTable(
  root: string,
  { before, status, changedSkills, changedSkillPaths }: WorkspaceSkillUpdateResult
): void {
  const changedPaths = new Set(changedSkillPaths)
  console.log(
    columns(
      ['skill', 'path', 'from', 'to'].map(h => pc.dim(h)),
      status.skills.map(s => {
        const prev = before.find(b => b.name === s.name && b.path === s.path)?.installed ?? null
        const versionChanged = prev !== s.installed
        const filesChanged = changedPaths.has(s.path)
        return [
          s.name,
          displaySkillPath(root, s.path),
          prev ?? pc.dim('none'),
          versionChanged
            ? pc.green(s.installed ?? '?')
            : filesChanged
              ? pc.green((s.installed ?? '?') + ' (files changed)')
              : pc.dim((s.installed ?? '?') + ' (no change)')
        ]
      })
    )
  )
  const nextStep =
    changedSkills.length > 0
      ? `  Reload changed skills before using them again: ${changedSkills.join(', ')}.`
      : '  No skill files changed. Keep using the copies already in context.'
  console.log('\n' + pc.dim(nextStep) + '\n')
}

// Colored status label for one skill row: minor+ behind is actionable, a patch
// gap is informational, otherwise current.
function skillState(s: WorkspaceSkillStatus): string {
  if (isMinorBehind(s.installed, s.bundled)) return pc.yellow('update available')
  if (isBehind(s.installed, s.bundled)) return pc.dim('patch behind')
  return pc.green('up to date')
}

// `update` and `install` are the same operation under two names (install kept
// for symmetry with how skills first land in a workspace). `dir` is a `--dir`
// option, not a positional: citty treats a bare positional on a command that
// carries subcommands as an unknown subcommand. Reuses the shared `dirArg`.
const defineSkillUpdate = (name: string, description: string) =>
  defineCommand({
    meta: { name, description },
    args: { dir: dirArg },
    async run({ args }) {
      await runSkillUpdate(resolve(args.dir))
    }
  })

const skillSubCommands = {
  update: defineSkillUpdate(
    'update',
    'Update this workspace’s skills to the version shipped with the CLI'
  ),
  install: defineSkillUpdate('install', 'Alias for `moi skill update`')
}

export const skill = defineCommand({
  meta: { name: 'skill', description: 'Show or update the workspace skills shipped with Moi' },
  subCommands: skillSubCommands,
  args: { dir: dirArg },
  async run({ args, rawArgs }) {
    // citty runs this parent handler even after dispatching a subcommand, so
    // bail when one was given — otherwise `moi skill update` also prints status.
    const sub = rawArgs.find(a => !a.startsWith('-'))
    if (sub && sub in skillSubCommands) return

    const { root, type } = await resolveWorkspace(resolve(args.dir))
    const statuses = await skillStatuses(root, type)

    console.log('\n' + pc.bold('moi skill') + pc.dim(' — workspace skills') + '\n')
    console.log(
      columns(
        ['skill', 'path', 'installed', 'bundled', 'status'].map(h => pc.dim(h)),
        statuses.map(s => [
          s.name,
          displaySkillPath(root, s.path),
          s.installed ?? pc.dim('—'),
          s.bundled ?? pc.dim('—'),
          skillState(s)
        ])
      )
    )
    if (statuses.some(s => isBehind(s.installed, s.bundled))) {
      console.log('\n' + pc.dim('  Run ') + pc.bold('moi skill update') + pc.dim(' to refresh.'))
    }
    console.log()
  }
})
