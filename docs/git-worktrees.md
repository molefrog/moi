# Limitation: git worktrees aren't supported as workspaces

**Status:** known limitation · discovery filtering added 2026-07-21

moi does **not** currently support being used as a workspace inside a linked
git worktree (a checkout created by `git worktree add`). Treat a worktree
directory as unsupported for now — open the primary working tree instead.

## What changed

Workspace discovery (the "Import from this computer" list on the home page)
scans Claude Code's session history and suggests every directory an agent has
ever run in (`server/harness/claude-code/index.ts` → `discoverWorkspaces`).
Agents frequently run inside throwaway worktree checkouts (e.g. worktree-isolated
runs), so those directories were showing up as if they were real workspaces.

Discovery now detects linked git worktrees and drops them from the suggestion
list, so they no longer get added by accident. This is a filter on **discovery
only** — it does not make moi work correctly inside a worktree.

## How the detection works

A linked worktree stores its `.git` as a **file** (not a directory) whose one
line points into the primary repo's git dir:

```
gitdir: /path/to/repo/.git/worktrees/<id>
```

`isLinkedGitWorktree` (`server/harness/claude-code/git-worktree.ts`) reads that
file and matches the `.git/worktrees/` segment. See
`git-worktree.test.ts` for the covered cases.

## Reliability

- **Standard worktrees** created by `git worktree add` are detected reliably —
  the `gitdir:` gitfile pointing into `.git/worktrees/<id>` is git's documented,
  stable layout (`man gitrepository-layout`).
- **The main working tree is never filtered** — its `.git` is a directory, so
  the read fails and the check returns `false`. A real repo can't be hidden.
- **Submodules are left alone** — their `.git` file points into `.git/modules/`,
  not `.git/worktrees/`, so it doesn't match.
- **Fails open** — any read error is treated as "not a worktree", so a transient
  filesystem hiccup never hides a legitimate workspace. The trade-off is that a
  worktree could occasionally slip through rather than a real workspace vanishing.
- **Known gap:** if a repo's common git dir isn't literally named `.git` (a bare
  repo used as the common dir, or a custom `$GIT_DIR`), the pointer won't contain
  `.git/worktrees/` and the worktree won't be filtered. This is uncommon.

## If you already added a worktree

The filter only affects future suggestions. A worktree you already imported is a
registered workspace and stays until you remove it — remove it from the
workspace list manually.
