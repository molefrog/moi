---
name: publish-release
description: Release moi-computer to npm — verify locally, hand off to the gated GitHub Actions workflow, then verify the published package. Defaults to a `next` preview; pass `stable` for a `latest` release. Use when the user asks to publish, release, ship a version, or cut a dev preview.
---

# Publish a moi-computer release

`publish-release` — preview under the `next` dist-tag.
`publish-release stable` — real release under `latest`, with a GitHub release.

**npm publishing happens only in GitHub Actions.** `.github/workflows/release.yml` authenticates
via npm trusted publishing (OIDC), gated behind the `release` environment's required reviewer.
There is no npm token anywhere and no npm session to reuse.

- Never run `npm publish` yourself. It will fail, and it is not the path.
- Never run `npm login` or ask the user for an OTP.
- A tag push is what starts a release. Tags are awkward to retract — earn the push with §2 first.

Two human checkpoints: the user confirms the version before the push, and approves the
deployment in GitHub after it. Everything else runs unattended.

## 0. Preflight

1. `git status` — clean tree, on `main`. Stop and ask if not.
2. `git fetch && git status -sb` — up to date with `origin/main`.
3. `git log origin/main..HEAD --oneline` — if anything is unpushed, show it and confirm it should ship.
4. Record whether a dev `bun link` is active, because §8 branches on it:

   ```sh
   readlink ~/.bun/install/global/node_modules/moi-computer
   ```

   A path into this repo means a dev link that §8 must restore. No output (it is a real
   directory) means an ordinary global install; a missing path means a clean container with
   nothing to put back.

   Do **not** check `~/.bun/bin/moi` for this. That symlink reads
   `../install/global/node_modules/moi-computer/bin/moi.mjs` in *every* case — linked or
   installed — so it cannot answer the question §8 asks. Only the level below discriminates.

Both a cloud container and the user's machine run every phase below. The only difference is what
§8 restores, which is why you captured it here rather than assuming.

## 1. Pick the version

Read the current state first — do not assume the file is a good starting point:
`npm view moi-computer dist-tags` and the `version` in `package.json`.

- **next**: if `package.json` already holds an `X.Y.Z-next.N` that sorts *above* the published
  `latest`, increment `N`. Otherwise start a fresh series at `<next patch above latest>-next.0`.
  The `next` tag has drifted below `latest` before; a preview that installs older code than
  stable is a bug, so verify the new version sorts above `latest` before continuing.
- **stable**: patch, minor, or major. If the intent is not obvious from the commits, ask.

Do not use `npm version` — it makes its own commit and tag.

## 2. Verify locally, before touching the version

Everything here is read-only with respect to git. It duplicates the CI `verify` job on purpose:
failing here costs nothing, failing after the tag push costs a burned version.

1. `bun install --frozen-lockfile`, `bun run lint`, `bun run format:check`, `bun test`.
2. **Pack and inspect.** Clear stale tarballs *first* — they accumulate in the repo root, and a
   bare `moi-computer-*.tgz` glob that matches more than one file makes `tar` read the first as
   the archive and the rest as members to list. Every check then fails against a perfectly good
   tarball. Pin the exact filename instead of globbing:

   ```sh
   rm -f moi-computer-*.tgz                                 # before packing, not after
   bun pm pack
   TGZ=$(ls moi-computer-*.tgz)                             # exactly one now
   tar -tzf "$TGZ" | grep -c '^package/dist/'               # must be > 0
   tar -tzf "$TGZ" | grep -Ei '\.env|secret'                # must be empty
   ```
3. **Skim what is shipping**: `git log <last tag>..HEAD --oneline`. Enough to describe the
   release and to know what §6 should poke at. Time-box it — a sanity check, not a QA pass.

Do **not** globally install the tarball here. It cannot coexist with a running dev server (see
§6), and §6 smoke-tests the real published package anyway, which is better evidence. Delete the
tarball once inspected.

## 3. Report and ask

Show the user, compactly: the version you propose, what is shipping since the last tag, and the
§2 check results (lint, format, test counts, tarball `dist/` count, secrets scan). Then ask
whether to bump and push.

There is no smoke output at this point — §2 deliberately skips the global install, and §6 does
the smoke against the published package. Do not go looking for it.

Wait for a real answer. This is the checkpoint that gates the version number.

## 4. Bump, tag, push

```sh
# edit package.json version by hand
git commit -am "Release vX.Y.Z"
git tag vX.Y.Z
git push origin main vX.Y.Z          # push the tag by name; --tags would push every local tag
```

The commit fires `.githooks` (`oxlint --fix`, `oxfmt`). Normally they touch nothing, since only
`package.json` changed — but if they do reformat files, those changes land in the release commit
silently. Check `git show --stat HEAD` and confirm it is the one-line version bump you expect.

Then surface the approval link and stop. Do **not** trust `--limit 1` on its own: GitHub may not
have created the run yet when the push returns, so the newest run can still be the *previous*
release. Match on the tag:

```sh
gh run list --workflow=release.yml --limit 5 \
  --json databaseId,url,status,headBranch \
  --jq '.[] | select(.headBranch == "vX.Y.Z")'
```

If that comes back empty, wait a few seconds and repeat until the run for your tag appears.
Give the user that URL and tell them to approve the `release` environment. One link, one click.

## 5. Wait for the run

`gh run watch <id> --exit-status`. It blocks until the user approves, so it can sit for a long
time — that is expected, not a hang. If it fails, read the logs before retrying.

Recovery, if `verify` fails or the run is rejected:

- Same version again: delete the tag both places (`git tag -d vX.Y.Z`,
  `git push origin :refs/tags/vX.Y.Z`) before re-pushing.
- Re-run against a tag that is already correct: `gh workflow run release.yml -f tag=vX.Y.Z`.

## 6. Verify the published package

1. `npm view moi-computer dist-tags` — the intended tag moved, and for a preview confirm
   `latest` did **not**.
2. `npm view moi-computer@<version> dist.attestations` — trusted publishing attaches provenance
   automatically; its absence means the publish did not go through OIDC.
3. **Smoke the published package.** This needs the moi ports to itself: `CONTROL_PORT` defaults to
   `13059` (`server/constants.ts`) and `server/control.ts` binds it unconditionally, so `--port`
   does not let a second instance coexist. (`MOI_CONTROL_PORT` overrides it, but that is a test
   seam — smoke the real defaults.) Before installing:
   - `lsof -ti:13059 -ti:13337` — if anything is running, it is almost certainly the user's own
     `bun run dev` in their terminal. Stop it, and **tell the user you stopped it**. Do not
     silently respawn it in §8; a detached agent-owned supervisor is not the same thing and its
     output goes where they are not looking.
   - `bun remove -g moi-computer` first. Installing over an existing install fails with
     ENOENT/DependencyLoop because the global `package.json` pins the old range. Despite `-g`,
     this still treats the **current directory as a project** and writes a `package.json` and
     lockfile there. Run it from the repo root (where both already exist and are git-tracked, so
     stray writes are visible) — never from `/tmp` or the scratchpad, where it leaves a junk
     `package.json` behind that will break `bun link` in §8.
   - `bun install -g moi-computer@<version>`, then `moi version`, `moi env`, `moi start`, and
     curl `/` and `/api/workspaces`. Poke at anything §2.3 flagged as new, if it is quick.

If this fails, publishing cannot be undone cleanly. Unpublish is only possible within 72 hours
and breaks anyone who already installed. The realistic remedy is `npm deprecate` on the bad
version plus a follow-up release. Tell the user rather than improvising.

## 7. Release notes — stable only

**Previews get no GitHub release and no release notes. Skip this entire section for `next`.**

For a stable release:

1. Read `.agents/rules/product-language.md` first — the notes are user-facing copy.
2. Draft a minimal bullet changelog plus a compare link
   (`https://github.com/molefrog/moi/compare/vPREV...vX.Y.Z`). Behavior the user can observe,
   not a file inventory.
3. Show the draft and confirm before publishing. Revise if asked.
4. `gh release create vX.Y.Z --title "vX.Y.Z" --notes-file <file> --latest`

## 8. Restore

Always run this, including after a failure or an abandoned release.

1. Kill the smoke-test server from §6.
2. Restore whatever §0.4 recorded:
   - Dev link present before: `bun remove -g moi-computer`, then `bun link` — **both run from
     the repo root**. `bun link` registers *the package in the current directory*, so running it
     anywhere else either errors (`package.json missing "name"`) or links the wrong thing. These
     are two separate commands with a directory requirement, not one chained sequence; if your
     tooling resets the working directory between calls, set it explicitly for each.
     Verify `~/.bun/install/global/node_modules/moi-computer` symlinks back to the repo, and
     `moi version` reports `X.Y.Z (githash)`.
   - Nothing installed before: `bun remove -g moi-computer`.
3. `rm -f moi-computer-*.tgz` and `rm -rf dist/`. A leftover `dist/index.html` silently shadows
   the dev client for linked `moi` runs (`server/static.ts`); only `bun run dev` ignores it.
4. If §6 stopped a dev server, say so plainly in the final report and leave restarting it to the
   user — `bun run dev` belongs in their terminal, not in a background process you own.
