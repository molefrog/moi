---
name: publish-next
description: Publish a dev preview of moi-computer to npm as X.Y.Z-next.N under the `next` dist-tag. Use when the user asks to publish/release a dev preview, next build, or prerelease. For stable releases (bumping `latest` + GitHub release) this is only a partial guide.
---

# Publish a dev preview (`next` dist-tag)

Publishes the current state of `main` as a `X.Y.Z-next.N` prerelease. Previews never move the `latest` dist-tag and do **not** get a GitHub release.

## Preconditions — check all before touching anything

1. Working tree is clean and on `main` (`git status`). Stop and ask if not.
2. npm auth is alive: `npm whoami`. A 401 here (or a 404 on `npm publish` PUT later) means expired auth — the user must run `npm login` themselves; you cannot.
3. No half-finished work the user didn't ask to ship — show `git log origin/main..HEAD --oneline` if there are unpushed commits and confirm the preview should include them.

## Steps

1. **Bump the version** in `package.json`: increment the `-next.N` suffix (e.g. `0.3.0-next.1` → `0.3.0-next.2`). If the previous release was stable, start a new series at `X.Y.Z-next.0` where `X.Y.Z` is the next planned version. Do not use `npm version` (it creates its own commit/tag).
2. **Commit and tag** — one-line commit message, matching tag:
   ```sh
   git commit -am "Release vX.Y.Z-next.N"
   git tag vX.Y.Z-next.N
   ```
3. **Pack**: `bun pm pack` (the `prepack` script builds the client). Verify the tarball before publishing:
   ```sh
   tar -tzf moi-computer-X.Y.Z-next.N.tgz | grep -c '^package/dist/'   # must be > 0
   tar -tzf moi-computer-X.Y.Z-next.N.tgz | grep -Ei '\.env|secret'    # must be empty
   ```
4. **Publish under the `next` tag** — the flag is mandatory, otherwise the prerelease hijacks `latest`:
   ```sh
   npm publish --tag next
   ```
5. **Push commit + tag**: `git push origin main vX.Y.Z-next.N` (push the tag by name; `--tags` would push every local tag).
6. **Verify**: `npm view moi-computer dist-tags` — `next` should now be the new version and `latest` unchanged.

## Optional smoke test of the tarball (before publishing)

Only if the user wants it — it disrupts the locally running server:

- Kill the running moi server first (it binds port 13337), restart it after so the user's workspace comes back.
- `bun remove -g moi-computer` before `bun install -g ./moi-computer-*.tgz` — installing over an existing registry install fails with ENOENT/DependencyLoop because the global package.json pins the old version range.
- Smoke: `moi version`, `moi env`, `moi start` + curl `/` and `/api/workspaces`.
- Afterwards restore whatever `moi` install the user had (`readlink ~/.bun/bin/moi` shows what's active; `bun link` in the repo restores the dev link).

## Cleanup

- Delete the tarball (`rm moi-computer-*.tgz`).
- Delete `dist/` — a leftover `dist/index.html` silently shadows the dev client for linked `moi` runs (`server/static.ts`); only `bun run dev` ignores it.
