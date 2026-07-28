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
4. **Record the starting state so §8 can restore it exactly:**
   - `readlink ~/.bun/bin/moi` — a path into this repo means a dev `bun link`; absent means a
     clean container with nothing to restore.
   - `lsof -ti:13337` — a running server that must come back up afterwards.

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
2. **Pack and inspect:**
   ```sh
   bun pm pack
   tar -tzf moi-computer-*.tgz | grep -c '^package/dist/'   # must be > 0
   tar -tzf moi-computer-*.tgz | grep -Ei '\.env|secret'    # must be empty
   ```
3. **Smoke the packed artifact** — the only check that exercises the real install tree:
   - Kill the server on 13337 if §0 found one.
   - `bun remove -g moi-computer` first. Installing over an existing install fails with
     ENOENT/DependencyLoop because the global `package.json` pins the old range.
   - `bun install -g /absolute/path/to/moi-computer-X.Y.Z.tgz` — a relative path fails.
   - `moi version`, `moi env`, then `moi start` and curl `/` and `/api/workspaces`.
4. **Skim what is shipping**: `git log <last tag>..HEAD --oneline`. If a change is quick to poke
   at in the smoke server, do it. Time-box this — it is a sanity check, not a QA pass.

## 3. Report and ask

Show the user, compactly: the version you propose, what is shipping since the last tag, the
tarball check results, and the smoke output. Then ask whether to bump and push.

Wait for a real answer. This is the checkpoint that gates the version number.

## 4. Bump, tag, push

```sh
# edit package.json version by hand
git commit -am "Release vX.Y.Z"
git tag vX.Y.Z
git push origin main vX.Y.Z          # push the tag by name; --tags would push every local tag
```

Then surface the approval link and stop:

```sh
gh run list --workflow=release.yml --limit 1 --json databaseId,url
```

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
2. Install the real thing from the registry and smoke it exactly as in §2.3:
   `bun remove -g moi-computer` → `bun install -g moi-computer@<version>` → `moi version`,
   `moi env`, `moi start` + curl.
3. `npm view moi-computer@<version> dist.attestations` — trusted publishing attaches provenance
   automatically; its absence means the publish did not go through OIDC.

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

1. Kill the smoke-test server.
2. Restore whatever §0 recorded:
   - Dev link present before: `bun remove -g moi-computer`, then `bun link` in the repo.
     Verify `~/.bun/install/global/node_modules/moi-computer` symlinks back to the repo, and
     `moi version` reports `X.Y.Z (githash)`.
   - Nothing installed before: `bun remove -g moi-computer`.
3. `rm -f moi-computer-*.tgz` and `rm -rf dist/`. A leftover `dist/index.html` silently shadows
   the dev client for linked `moi` runs (`server/static.ts`); only `bun run dev` ignores it.
4. If a server was running on 13337 before you started, bring it back up.
