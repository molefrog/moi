// Detecting linked git worktrees so workspace discovery can skip them.
//
// Claude Code accumulates session history in every directory an agent ever ran
// in, including the throwaway checkouts created for worktree-isolated runs.
// Those derived directories shouldn't surface as importable workspaces in the
// discovery list, so we filter them out. moi doesn't support running inside a
// worktree yet — see docs/git-worktrees.md.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// A linked git worktree stores its `.git` as a *file* (not a directory) whose
// single line points into the primary repo: `gitdir: /repo/.git/worktrees/<id>`.
// Return true only for that shape. Submodules also use a `.git` file, but they
// point into `.git/modules/…`, so keying on the `worktrees` segment leaves
// submodule checkouts alone.
export function pointsIntoWorktrees(gitFileContents: string): boolean {
  const match = /^gitdir:\s*(.+?)\s*$/m.exec(gitFileContents)
  if (!match) return false
  return /(?:^|[/\\])\.git[/\\]worktrees[/\\]/.test(match[1])
}

// Whether `dir` is a linked git worktree checkout. A normal repo keeps `.git`
// as a directory (so `readFile` fails with EISDIR → false); a non-repo has no
// `.git` at all (ENOENT → false). Any read error is treated as "not a
// worktree" so discovery fails open rather than hiding real workspaces.
export async function isLinkedGitWorktree(dir: string): Promise<boolean> {
  try {
    return pointsIntoWorktrees(await readFile(join(dir, '.git'), 'utf8'))
  } catch {
    return false
  }
}
